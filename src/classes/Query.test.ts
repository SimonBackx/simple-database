import { column } from "../decorators/Column";
import { Database } from "./Database";
import { Model } from "./Model";
import { SelectQuery, WhereEqual, WhereSign } from "./Query";
import { ToMany, ToOne } from "./relations/ToOne";

describe("Query", () => {
    class Animal extends Model {
        static table = 'animals'

        @column({type: 'string', primary: true})
        id: string

        @column({type: 'string'})
        name: string

        static toys: ToMany<"toys", Toy>
    }

    class ToyName extends Model {
        static table = 'toy_names'

        @column({type: 'string', primary: true})
        id: string

        @column({type: 'string'})
        name: string

        @column({type: 'string'})
        toy_id: string
    }

    class Toy extends Model {
        static table = 'toys'

        // Shape of the toy is always that of an animal
        static shape = new ToOne(Animal, 'shape', 'shape_id')
        static names = new ToMany(ToyName, 'names', 'toy_id')

        @column({type: 'string', primary: true})
        id: string

        @column({type: 'string'})
        name: string

        @column({type: 'string'/*, foreignKey: Dog.animal*/})
        dog_id: string

        @column({type: 'string'/*, foreignKey: Dog.animal*/})
        shape_id: string
    }

    // fix for reference cycle
    Animal.toys = new ToMany(Toy, 'toys', 'shape_id')

    class Dog extends Model {
        static table = 'dogs'

        static animal = new ToOne(Animal, 'animal', 'animal_id')

        static toys = new ToMany(Toy, 'toys', 'dog_id')

        @column({type: 'string', primary: true})
        id: string

        @column({type: 'string'/*, foreignKey: Dog.animal*/, nullable: true})
        animal_id: string

        @column({type: 'string'})
        name: string
    }

    describe('Where', () => {
        it('can use normal syntax', () => {
            const query = new SelectQuery(Dog)
                .where('name', 'value')
                .andWhere('name2', 'value2')

            const [str, params] = query.getSQL();
            expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` = ? AND `dogs`.`name2` = ?');
            expect(params).toEqual(['value', 'value2']);
        })

        it('doesn\'t inerpret column selector if no value passed', () => {
            const query = Dog
                .where({
                    // This is a valid column selector, but this should be handled as WhereEqualShort
                    column: 'name'
                })

            const [str, params] = query.getSQL();
            expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`column` = ?');
            expect(params).toEqual(['name']);
        })

        it('throws if value is missing', () => {
            expect(() => Dog.where('columnName')).toThrow()
        })

        it('throws if array is empty', () => {
            expect(() => Dog.where([])).toThrow()
        })

        it('can use object syntax', () => {
            const query = new SelectQuery(Dog)
                .where({
                    name: 'value',
                    name2: 'value2'
                })

            const [str, params] = query.getSQL();
            expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` = ? AND `dogs`.`name2` = ?');
            expect(params).toEqual(['value', 'value2']);
        })

        it('can use array syntax', () => {
            const query = Dog.where([
                    new WhereEqual('name', 'value'),
                    new WhereEqual('name2', 'value2')
                ])

            const [str, params] = query.getSQL();
            expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` = ? AND `dogs`.`name2` = ?');
            expect(params).toEqual(['value', 'value2']);
        })

        it('can set not equal sign', () => {
            const query = new SelectQuery(Dog)
                .where('name', WhereSign.NotEqual, 'value')

            const [str, params] = query.getSQL();
            expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` != ?');
            expect(params).toEqual(['value']);
        })

        it('can set equal sign', () => {
            const query = new SelectQuery(Dog)
                .where('name', WhereSign.Equal, 'value')

            const [str, params] = query.getSQL();
            expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` = ?');
            expect(params).toEqual(['value']);
        })

        it('can invert not equal sign', () => {
            const query = new SelectQuery(Dog)
                .whereNot('name', WhereSign.NotEqual, 'value')

            const [str, params] = query.getSQL();
            expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` = ?');
            expect(params).toEqual(['value']);
        })

        it('can invert equal sign', () => {
            const query = new SelectQuery(Dog)
                .whereNot('name', WhereSign.Equal, 'value')

            const [str, params] = query.getSQL();
            expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` != ?');
            expect(params).toEqual(['value']);
        })

        it('can join via OR', () => {
            const query = new SelectQuery(Dog)
                .where({
                    name: 'value',
                    name2: 'value2'
                }).orWhere({
                    color: 'value3'
                });

            const [str, params] = query.getSQL();
            expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE (`dogs`.`name` = ? AND `dogs`.`name2` = ?) OR `dogs`.`color` = ?');
            expect(params).toEqual(['value', 'value2', 'value3']);
        })


        it('transforms where IN queries', () => {
            const query = new SelectQuery(Dog)
                .where({
                    name: ['a', 'b'],
                });

            const [str, params] = query.getSQL();
            expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` IN (?)');
            expect(params).toEqual([['a', 'b']]);
        })

        it('transforms where NOT IN queries', () => {
            const query = new SelectQuery(Dog)
                .whereNot({
                    name: ['a', 'b'],
                });

            const [str, params] = query.getSQL();
            expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` NOT IN (?)');
            expect(params).toEqual([['a', 'b']]);
        })

        it('transforms where NULL queries', () => {
            const query = new SelectQuery(Dog)
                .where({
                    name: null,
                });

            const [str, params] = query.getSQL();
            expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` IS NULL');
            expect(params).toEqual([]);
        })

        it('transforms where NOT NULL queries', () => {
            const query = new SelectQuery(Dog)
                .whereNot({
                    name: null,
                });

            const [str, params] = query.getSQL();
            expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` IS NOT NULL');
            expect(params).toEqual([]);
        })

        // Value types
        it('where IN', () => {
            const queries = [
                Dog.where('name', ['a', 'b']),
                new SelectQuery(Dog).where('name', ['a', 'b']),
                new SelectQuery(Dog).where('name', WhereSign.Equal, ['a', 'b']),
                new SelectQuery(Dog).where({
                    name: ['a', 'b']
                })
            ]

            for (const query of queries) {
                const [str, params] = query.getSQL();
                expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` IN (?)');
                expect(params).toEqual([['a', 'b']]);
            }
        })

        it('WHERE NOT IN', () => {
            const queries = [
                new SelectQuery(Dog).whereNot('name', ['a', 'b']),
                new SelectQuery(Dog).where('name', WhereSign.NotEqual, ['a', 'b']),
                new SelectQuery(Dog).whereNot({
                    name: ['a', 'b']
                })
            ]

            for (const query of queries) {
                const [str, params] = query.getSQL();
                expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` NOT IN (?)');
                expect(params).toEqual([['a', 'b']]);
            }
        })

        it('WHERE IS NULL', () => {
            const queries = [
                new SelectQuery(Dog).where('name', null),
                new SelectQuery(Dog).where('name', WhereSign.Equal, null),
                new SelectQuery(Dog).where({
                    name: null
                })
            ]

            for (const query of queries) {
                const [str, params] = query.getSQL();
                expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` IS NULL');
                expect(params).toEqual([]);
            }
        })

        it('WHERE IS NOT NULL', () => {
            const queries = [
                new SelectQuery(Dog).whereNot('name', null),
                new SelectQuery(Dog).where('name', WhereSign.NotEqual, null),
                new SelectQuery(Dog).whereNot({
                    name: null
                })
            ]

            for (const query of queries) {
                const [str, params] = query.getSQL();
                expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` IS NOT NULL');
                expect(params).toEqual([]);
            }
        })

        it('orWhere behaves normally if first', () => {
            const query = new SelectQuery(Dog)
                .orWhere({
                    name: 'value',
                    name2: 'value2'
                });

            const [str, params] = query.getSQL();
            expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` = ? AND `dogs`.`name2` = ?');
            expect(params).toEqual(['value', 'value2']);
        })

        it('orWhereNot', () => {
            const query = new SelectQuery(Dog)
                .where({
                    name: 'value',
                    name2: 'value2'
                }).orWhereNot({
                    color: 'value3'
                });

            const [str, params] = query.getSQL();
            expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE (`dogs`.`name` = ? AND `dogs`.`name2` = ?) OR `dogs`.`color` != ?');
            expect(params).toEqual(['value', 'value2', 'value3']);
        })

        it('andWhereNot', () => {
            const query = new SelectQuery(Dog)
                .where({
                    name: 'value',
                    name2: 'value2'
                }).andWhereNot({
                    color: 'value3'
                });

            const [str, params] = query.getSQL();
            expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE (`dogs`.`name` = ? AND `dogs`.`name2` = ?) AND `dogs`.`color` != ?');
            expect(params).toEqual(['value', 'value2', 'value3']);
        })

        describe('Namespaces', () => {
            it('Can set custom namespace', () => {
                const queries = [
                    new SelectQuery(Dog).where({
                        column: 'col',
                        namespace: 'animals'
                    }, null),

                    new SelectQuery(Dog).where(new WhereEqual({
                        column: 'col',
                        namespace: 'animals'
                    }, null)),

                    new SelectQuery(Dog).where(new WhereEqual({
                        column: 'col',
                        namespace: 'animals'
                    }, WhereSign.Equal, null)),

                    new SelectQuery(Dog).where({
                        column: 'col',
                        namespace: 'animals'
                    }, WhereSign.Equal, null),

                    new SelectQuery(Dog).where({
                        column: 'col',
                        model: Animal
                    }, null),

                    new SelectQuery(Dog).where(new WhereEqual({
                        column: 'col',
                        model: Animal
                    }, null)),

                    new SelectQuery(Dog).where(new WhereEqual({
                        column: 'col',
                        model: Animal
                    }, WhereSign.Equal, null)),

                    new SelectQuery(Dog).where({
                        column: 'col',
                        model: Animal
                    }, WhereSign.Equal, null),
                ]

                for (const query of queries) {
                    const [str, params] = query.getSQL();
                    expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `animals`.`col` IS NULL');
                    expect(params).toEqual([]);
                }
            })

            it('Can set custom namespace for values', () => {
                const queries = [
                    new SelectQuery(Dog).where('col', {
                        column: 'other',
                        namespace: 'animals'
                    }),

                    new SelectQuery(Dog).where({
                        col: {
                            column: 'other',
                            namespace: 'animals'
                        }
                    }),

                    new SelectQuery(Dog).where('col', WhereSign.Equal, {
                        column: 'other',
                        namespace: 'animals'
                    }),

                    new SelectQuery(Dog).where('col', {
                        column: 'other',
                        model: Animal
                    }),

                    new SelectQuery(Dog).where({
                        col: {
                            column: 'other',
                        model: Animal
                        }
                    }),

                    new SelectQuery(Dog).where('col', WhereSign.Equal, {
                        column: 'other',
                        model: Animal
                    }),
                ]

                for (const query of queries) {
                    const [str, params] = query.getSQL();
                    expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`col` = `animals`.`other`');
                    expect(params).toEqual([]);
                }
            })

            it('Can set custom namespace for values and column at same time', () => {
                const queries = [
                    new SelectQuery(Dog).where({
                        column: 'name',
                        namespace: 'tests'
                    }, {
                        column: 'other',
                        namespace: 'animals'
                    }),

                    new SelectQuery(Dog).where({
                        column: 'name',
                        namespace: 'tests'
                    }, WhereSign.Equal, {
                        column: 'other',
                        namespace: 'animals'
                    }),

                    new SelectQuery(Dog).where({
                        column: 'name',
                        namespace: 'tests'
                    }, {
                        column: 'other',
                        model: Animal
                    }),

                    new SelectQuery(Dog).where({
                        column: 'name',
                        namespace: 'tests'
                    }, WhereSign.Equal, {
                        column: 'other',
                        model: Animal
                    }),
                ]

                for (const query of queries) {
                    const [str, params] = query.getSQL();
                    expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `tests`.`name` = `animals`.`other`');
                    expect(params).toEqual([]);
                }
            })

            it('defaults to default namespace', () => {
                const queries = [
                    new SelectQuery(Dog).where({
                        column: 'col'
                    }, {
                        column: 'other'
                    }),

                    new SelectQuery(Dog).where({
                        column: 'col'
                    }, WhereSign.Equal, {
                        column: 'other'
                    }),
                ]

                for (const query of queries) {
                    const [str, params] = query.getSQL();
                    expect(str).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`col` = `dogs`.`other`');
                    expect(params).toEqual([]);
                }
            })
        })

        describe('Joins', () => {
            it('basic inner join', () => {
                const query = new SelectQuery(Dog)
                    .join(Animal, {
                        id: {
                            column: 'animal_id',
                            model: Dog
                        }
                    })
                    .where({
                        name: 'value'
                    });

                const [str, params] = query.getSQL();
                expect(str).toEqual('SELECT `dogs`.*, `animals`.* FROM `dogs` JOIN `animals` ON `animals`.`id` = `dogs`.`animal_id` WHERE `dogs`.`name` = ?');
                expect(params).toEqual(['value']);
            });

            it('basic left join', () => {
                const query = new SelectQuery(Dog)
                    .leftJoin(Animal, {
                        id: {
                            column: 'animal_id',
                            model: Dog
                        }
                    })
                    .where({
                        name: 'value'
                    });

                const [str, params] = query.getSQL();
                expect(str).toEqual('SELECT `dogs`.*, `animals`.* FROM `dogs` LEFT JOIN `animals` ON `animals`.`id` = `dogs`.`animal_id` WHERE `dogs`.`name` = ?');
                expect(params).toEqual(['value']);
            });

            it('basic right join', () => {
                const query = new SelectQuery(Dog)
                    .rightJoin(Animal, {
                        id: {
                            column: 'animal_id',
                            model: Dog
                        }
                    })
                    .where({
                        name: 'value'
                    });

                const [str, params] = query.getSQL();
                expect(str).toEqual('SELECT `dogs`.*, `animals`.* FROM `dogs` RIGHT JOIN `animals` ON `animals`.`id` = `dogs`.`animal_id` WHERE `dogs`.`name` = ?');
                expect(params).toEqual(['value']);
            });

            it('join with custom namespace', () => {
                const query = new SelectQuery(Dog)
                    .leftJoin({
                        model: Animal,
                        namespace: 'A'
                    }, 'id', {
                        column: 'animal_id',
                        model: Dog
                    })
                    .where({
                        name: 'value'
                    });

                const [str, params] = query.getSQL();
                expect(str).toEqual('SELECT `dogs`.*, `A`.* FROM `dogs` LEFT JOIN `animals` AS `A` ON `A`.`id` = `dogs`.`animal_id` WHERE `dogs`.`name` = ?');
                expect(params).toEqual(['value']);
            });
        });

        describe('Relations', () => {
            it('can load many to one', async () => {
                // Map select
                jest.spyOn(Database, 'select').mockImplementation((q) => {
                    expect(q).toEqual('SELECT `dogs`.*, `animals`.* FROM `dogs` JOIN `animals` ON `animals`.`id` = `dogs`.`animal_id`');
                    return Promise.resolve([
                        [
                            {
                                dogs: {
                                    id: 'dog123',
                                    animal_id: 'dog',
                                    name: 'My dog name'
                                },
                                animals: {
                                    id: 'dog',
                                    name: 'Dog'
                                }
                            }
                        ],
                        undefined
                    ]);
                })
                const query = new SelectQuery(Dog)
                    .with(Dog.animal)

                const fetched = await query.fetch();
                expect(fetched).toHaveLength(1);

                expect(fetched[0].name).toEqual('My dog name')
                expect(fetched[0].animal.name).toEqual('Dog')
            });

            // eslint-disable-next-line jest/no-commented-out-tests
            it('can load one to many', async () => {
                // Map select
                jest.spyOn(Database, 'select').mockImplementation((q) => {
                    expect(q).toEqual('SELECT `dogs`.* FROM `dogs`');

                    // Now replace next call
                    jest.spyOn(Database, 'select').mockImplementation((q, params) => {
                        expect(q).toEqual('SELECT `toys`.*, `animals`.* FROM `toys` JOIN `animals` ON `animals`.`id` = `toys`.`shape_id` WHERE `toys`.`dog_id` IN (?)');
                        expect(params).toEqual([['dog123', 'dog124']]);

                        return Promise.resolve([
                            [
                                {
                                    toys: {
                                        id: 'toy1',
                                        name: 'Toy 1',
                                        dog_id: 'dog123',
                                        shape_id: 'lion_id'
                                    },
                                    animals: {
                                        id: 'lion_id',
                                        name: 'Lion'
                                    }
                                },
                                {
                                    toys: {
                                        id: 'toy2',
                                        name: 'Toy 2',
                                        dog_id: 'dog124',
                                        shape_id: 'lion_id'
                                    },
                                    animals: {
                                        id: 'lion_id',
                                        name: 'Lion'
                                    }
                                },
                                {
                                    toys: {
                                        id: 'toy3',
                                        name: 'Toy 3',
                                        dog_id: 'dog123',
                                        shape_id: 'horse_id'
                                    },
                                    animals: {
                                        id: 'horse_id',
                                        name: 'Horse'
                                    }
                                }
                            ],
                            undefined
                        ]);
                    });

                    return Promise.resolve([
                        [
                            {
                                dogs: {
                                    id: 'dog123',
                                    animal_id: 'dog',
                                    name: 'My dog name'
                                }
                            },
                            {
                                dogs: {
                                    id: 'dog124',
                                    animal_id: 'dog',
                                    name: 'Other dog'
                                }
                            }
                        ],
                        undefined
                    ]);
                })
                
                const query = new SelectQuery(Dog)
                    .with(
                        Dog.toys.with(Toy.shape)
                    );

                const fetched = await query.fetch();
                expect(fetched).toHaveLength(2);

                const dog = fetched[0];
                const dog2 = fetched[1];

                expect(dog.name).toEqual('My dog name')
                expect(dog2.name).toEqual('Other dog')

                expect(dog.toys).toHaveLength(2);
                expect(dog2.toys).toHaveLength(1);

                expect(dog.toys[0].name).toEqual('Toy 1')
                expect(dog.toys[1].name).toEqual('Toy 3')

                expect(dog2.toys[0].name).toEqual('Toy 2')

                expect(dog.toys[0].shape.name).toEqual('Lion')
                expect(dog.toys[1].shape.name).toEqual('Horse')
                expect(dog2.toys[0].shape.name).toEqual('Lion')
            });

            it('can load to many > to one > to many', async () => {
                // Map select
                jest.spyOn(Database, 'select').mockImplementation((q) => {
                    expect(q).toEqual('SELECT `dogs`.* FROM `dogs`');

                    // Now replace next call
                    jest.spyOn(Database, 'select').mockImplementation((q, params) => {
                        expect(q).toEqual('SELECT `toys`.*, `animals`.* FROM `toys` JOIN `animals` ON `animals`.`id` = `toys`.`shape_id` WHERE `toys`.`dog_id` IN (?)');
                        expect(params).toEqual([['dog123', 'dog124']]);

                        jest.spyOn(Database, 'select').mockImplementation((q, params) => {
                            expect(q).toEqual('SELECT `toys`.* FROM `toys` WHERE `toys`.`shape_id` IN (?)');
                            expect(params).toEqual([['lion_id', 'horse_id']]);
                            
                            jest.spyOn(Database, 'select').mockImplementation((q, params) => {
                                throw new Error('Last call not implemented')
                            });

                            return Promise.resolve([
                                [
                                    {
                                        toys: {
                                            id: 'toy1',
                                            name: 'Toy 1',
                                            dog_id: 'dog123',
                                            shape_id: 'lion_id'
                                        }
                                    },
                                    {
                                        toys: {
                                            id: 'toy2',
                                            name: 'Toy 2',
                                            dog_id: 'dog124',
                                            shape_id: 'lion_id'
                                        }
                                    },
                                    {
                                        toys: {
                                            id: 'toy3',
                                            name: 'Toy 3',
                                            dog_id: 'dog123',
                                            shape_id: 'horse_id'
                                        }
                                    }
                                ],
                                undefined
                            ]);
                        });

                        return Promise.resolve([
                            [
                                {
                                    toys: {
                                        id: 'toy1',
                                        name: 'Toy 1',
                                        dog_id: 'dog123',
                                        shape_id: 'lion_id'
                                    },
                                    animals: {
                                        id: 'lion_id',
                                        name: 'Lion'
                                    }
                                },
                                {
                                    toys: {
                                        id: 'toy2',
                                        name: 'Toy 2',
                                        dog_id: 'dog124',
                                        shape_id: 'lion_id'
                                    },
                                    animals: {
                                        id: 'lion_id',
                                        name: 'Lion'
                                    }
                                },
                                {
                                    toys: {
                                        id: 'toy3',
                                        name: 'Toy 3',
                                        dog_id: 'dog123',
                                        shape_id: 'horse_id'
                                    },
                                    animals: {
                                        id: 'horse_id',
                                        name: 'Horse'
                                    }
                                }
                            ],
                            undefined
                        ]);
                    });

                    return Promise.resolve([
                        [
                            {
                                dogs: {
                                    id: 'dog123',
                                    animal_id: 'dog',
                                    name: 'My dog name'
                                }
                            },
                            {
                                dogs: {
                                    id: 'dog124',
                                    animal_id: 'dog',
                                    name: 'Other dog'
                                }
                            }
                        ],
                        undefined
                    ]);
                })
                
                const query = new SelectQuery(Dog)
                    .with(
                        Dog.toys.with(Toy.shape.with(Animal.toys))
                    );

                const fetched = await query.fetch();
                expect(fetched).toHaveLength(2);

                const dog = fetched[0];
                const dog2 = fetched[1];

                expect(dog.name).toEqual('My dog name')
                expect(dog2.name).toEqual('Other dog')

                expect(dog.toys).toHaveLength(2);
                expect(dog2.toys).toHaveLength(1);

                expect(dog.toys[0].name).toEqual('Toy 1')
                expect(dog.toys[1].name).toEqual('Toy 3')

                expect(dog2.toys[0].name).toEqual('Toy 2')

                expect(dog.toys[0].shape.name).toEqual('Lion')
                expect(dog.toys[1].shape.name).toEqual('Horse')
                expect(dog2.toys[0].shape.name).toEqual('Lion')

                expect(dog.toys[0].shape.toys).toHaveLength(2)
                expect(dog.toys[0].shape.toys).toEqual([Object.assign({}, dog.toys[0], {shape: undefined}), Object.assign({}, dog2.toys[0], {shape: undefined})])

                expect(dog.toys[1].shape.toys).toHaveLength(1)
                expect(dog.toys[1].shape.toys).toEqual([Object.assign({}, dog.toys[1], {shape: undefined})])

                expect(dog2.toys[0].shape.toys).toHaveLength(2)
                expect(dog2.toys[0].shape.toys).toEqual([Object.assign({}, dog.toys[0], {shape: undefined}), Object.assign({}, dog2.toys[0], {shape: undefined})])
            });

            it('can load to many > to many', async () => {
                // Map select
                jest.spyOn(Database, 'select').mockImplementation((q) => {
                    expect(q).toEqual('SELECT `dogs`.* FROM `dogs`');

                    // Now replace next call
                    jest.spyOn(Database, 'select').mockImplementation((q, params) => {
                        expect(q).toEqual('SELECT `toys`.* FROM `toys` WHERE `toys`.`dog_id` IN (?)');
                        expect(params).toEqual([['dog123', 'dog124']]);

                        jest.spyOn(Database, 'select').mockImplementation((q, params) => {
                            expect(q).toEqual('SELECT `toy_names`.* FROM `toy_names` WHERE `toy_names`.`toy_id` IN (?)');
                            expect(params).toEqual([['toy1', 'toy2', 'toy3']]);
                            
                            jest.spyOn(Database, 'select').mockImplementation((q, params) => {
                                throw new Error('Last call not implemented')
                            });

                            return Promise.resolve([
                                [
                                    {
                                        toy_names: {
                                            id: 'toy1_name1',
                                            name: 'Toy 1 name 1',
                                            toy_id: 'toy1'
                                        }
                                    },
                                    {
                                        toy_names: {
                                            id: 'toy1_name2',
                                            name: 'Toy 1 name 2',
                                            toy_id: 'toy1'
                                        }
                                    },
                                     {
                                        toy_names: {
                                            id: 'toy2_name1',
                                            name: 'Toy 2 name 1',
                                            toy_id: 'toy2'
                                        }
                                    },
                                    {
                                        toy_names: {
                                            id: 'toy2_name2',
                                            name: 'Toy 2 name 2',
                                            toy_id: 'toy2'
                                        }
                                    },
                                     {
                                        toy_names: {
                                            id: 'toy3_name1',
                                            name: 'Toy 3 name 1',
                                            toy_id: 'toy3'
                                        }
                                    },
                                    {
                                        toy_names: {
                                            id: 'toy3_name2',
                                            name: 'Toy 3 name 2',
                                            toy_id: 'toy3'
                                        }
                                    }
                                ],
                                undefined
                            ]);
                        });

                        return Promise.resolve([
                            [
                                {
                                    toys: {
                                        id: 'toy1',
                                        name: 'Toy 1',
                                        dog_id: 'dog123',
                                        shape_id: 'lion_id'
                                    },
                                    animals: {
                                        id: 'lion_id',
                                        name: 'Lion'
                                    }
                                },
                                {
                                    toys: {
                                        id: 'toy2',
                                        name: 'Toy 2',
                                        dog_id: 'dog124',
                                        shape_id: 'lion_id'
                                    },
                                    animals: {
                                        id: 'lion_id',
                                        name: 'Lion'
                                    }
                                },
                                {
                                    toys: {
                                        id: 'toy3',
                                        name: 'Toy 3',
                                        dog_id: 'dog123',
                                        shape_id: 'horse_id'
                                    },
                                    animals: {
                                        id: 'horse_id',
                                        name: 'Horse'
                                    }
                                }
                            ],
                            undefined
                        ]);
                    });

                    return Promise.resolve([
                        [
                            {
                                dogs: {
                                    id: 'dog123',
                                    animal_id: 'dog',
                                    name: 'My dog name'
                                }
                            },
                            {
                                dogs: {
                                    id: 'dog124',
                                    animal_id: 'dog',
                                    name: 'Other dog'
                                }
                            }
                        ],
                        undefined
                    ]);
                })
                
                const query = new SelectQuery(Dog)
                    .with(
                        Dog.toys.with(Toy.names)
                    );

                const fetched = await query.fetch();
                expect(fetched).toHaveLength(2);

                const dog = fetched[0];
                const dog2 = fetched[1];

                expect(dog.name).toEqual('My dog name')
                expect(dog2.name).toEqual('Other dog')

                expect(dog.toys).toHaveLength(2);
                expect(dog2.toys).toHaveLength(1);

                expect(dog.toys[0].name).toEqual('Toy 1')
                expect(dog.toys[1].name).toEqual('Toy 3')

                expect(dog2.toys[0].name).toEqual('Toy 2')

                expect(dog.toys[0].names).toHaveLength(2)
                expect(dog.toys[1].names).toHaveLength(2)
                expect(dog2.toys[0].names).toHaveLength(2)

                expect(dog.toys[0].names.map(n => n.name)).toEqual(['Toy 1 name 1', 'Toy 1 name 2'])
                expect(dog.toys[1].names.map(n => n.name)).toEqual(['Toy 3 name 1', 'Toy 3 name 2'])

                expect(dog2.toys[0].names.map(n => n.name)).toEqual(['Toy 2 name 1', 'Toy 2 name 2'])
            });

            it('can load optional to one relation', async () => {
                // Map select
                jest.spyOn(Database, 'select').mockImplementation((q) => {
                    expect(q).toEqual('SELECT `dogs`.*, `animals`.* FROM `dogs` LEFT JOIN `animals` ON `animals`.`id` = `dogs`.`animal_id`');

                     jest.spyOn(Database, 'select').mockImplementation((q, params) => {
                        throw new Error('Last call not implemented')
                    });

                    return Promise.resolve([
                        [
                            {
                                dogs: {
                                    id: 'dog123',
                                    animal_id: null,
                                    name: 'My dog name'
                                }, animals: {
                                    id: null,
                                    name: null
                                }
                            },
                            {
                                dogs: {
                                    id: 'dog124',
                                    animal_id: 'dog',
                                    name: 'Other dog'
                                },
                                animals: {
                                    id: 'dog',
                                    name: 'Dog'
                                }
                            }
                        ],
                        undefined
                    ]);
                })
                
                const query = new SelectQuery(Dog)
                    .with(
                        Dog.animal.optional()
                    );

                const fetched = await query.fetch();
                expect(fetched).toHaveLength(2);

                const dog = fetched[0];
                const dog2 = fetched[1];

                expect(dog.name).toEqual('My dog name')
                expect(dog2.name).toEqual('Other dog')

                expect(dog.animal).toEqual(null)
                expect(dog2.animal?.name).toEqual('Dog')
            });

            it('can throws non optional to one relation', async () => {
                // Map select
                jest.spyOn(Database, 'select').mockImplementation((q) => {
                    expect(q).toEqual('SELECT `dogs`.*, `animals`.* FROM `dogs` JOIN `animals` ON `animals`.`id` = `dogs`.`animal_id`');

                     jest.spyOn(Database, 'select').mockImplementation((q, params) => {
                        throw new Error('Last call not implemented')
                    });

                    return Promise.resolve([
                        [
                            {
                                dogs: {
                                    id: 'dog123',
                                    animal_id: null,
                                    name: 'My dog name'
                                }, animals: {
                                    id: null,
                                    name: null
                                }
                            },
                            {
                                dogs: {
                                    id: 'dog124',
                                    animal_id: 'dog',
                                    name: 'Other dog'
                                },
                                animals: {
                                    id: 'dog',
                                    name: 'Dog'
                                }
                            }
                        ],
                        undefined
                    ]);
                })
                
                const query = new SelectQuery(Dog)
                    .with(
                        Dog.animal
                    );

                await expect(query.fetch()).rejects.toThrow(/no match found when loading animals for dogs.dog123/);
            });
        });

        it.todo('Multiple toOne relations on same table');
    })

    describe('First', () => {
        it('limits query and returns first response', async () => {
            jest.spyOn(Database, 'select').mockImplementation((q) => {
                expect(q).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` = ? LIMIT 1');

                jest.spyOn(Database, 'select').mockImplementation((q, params) => {
                    throw new Error('Last call not implemented')
                });

                return Promise.resolve([
                    [
                        {
                            dogs: {
                                id: 'dog123',
                                animal_id: null,
                                name: 'My dog name'
                            }
                        },

                        // this is fake, but just to test what happens
                        {
                            dogs: {
                                id: 'dog124',
                                animal_id: 'dog',
                                name: 'Other dog'
                            }
                        }
                    ],
                    undefined
                ]);
            });
            const dog = await Dog.where({name: 'test'}).first();

            expect(dog).toBeDefined();
            expect(dog?.id).toEqual('dog123');
        });

        it('returns undefined if not found', async () => {
            jest.spyOn(Database, 'select').mockImplementation((q) => {
                expect(q).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` = ? LIMIT 1');

                jest.spyOn(Database, 'select').mockImplementation((q, params) => {
                    throw new Error('Last call not implemented')
                });

                return Promise.resolve([
                    [],
                    undefined
                ]);
            });
            const dog = await Dog.where({name: 'test'}).first();
            expect(dog).toBeUndefined();
        });
    });
    describe('Limits', () => {
        it('can set limit and offset', async () => {
            jest.spyOn(Database, 'select').mockImplementation((q) => {
                expect(q).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` = ? LIMIT 5 OFFSET 10');

                jest.spyOn(Database, 'select').mockImplementation((q, params) => {
                    throw new Error('Last call not implemented')
                });

                return Promise.resolve([
                    [
                        {
                            dogs: {
                                id: 'dog123',
                                animal_id: null,
                                name: 'My dog name'
                            }
                        },

                        // this is fake, but just to test what happens
                        {
                            dogs: {
                                id: 'dog124',
                                animal_id: 'dog',
                                name: 'Other dog'
                            }
                        }
                    ],
                    undefined
                ]);
            });
            const dogs = await Dog.where({name: 'test'}).limit(5, 10).fetch();
            expect(dogs).toHaveLength(2)
        });

        it('can set limit without offset', async () => {
            jest.spyOn(Database, 'select').mockImplementation((q) => {
                expect(q).toEqual('SELECT `dogs`.* FROM `dogs` WHERE `dogs`.`name` = ? LIMIT 5');

                jest.spyOn(Database, 'select').mockImplementation((q, params) => {
                    throw new Error('Last call not implemented')
                });

                return Promise.resolve([
                    [
                        {
                            dogs: {
                                id: 'dog123',
                                animal_id: null,
                                name: 'My dog name'
                            }
                        },

                        // this is fake, but just to test what happens
                        {
                            dogs: {
                                id: 'dog124',
                                animal_id: 'dog',
                                name: 'Other dog'
                            }
                        }
                    ],
                    undefined
                ]);
            });
            const dogs = await Dog.where({name: 'test'}).limit(5).fetch();
            expect(dogs).toHaveLength(2)
        });
    });
});