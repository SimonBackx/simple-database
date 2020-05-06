/* eslint-disable @typescript-eslint/unbound-method */
import { column } from "../decorators/Column";
import { Database } from "./Database";
import { ManyToManyRelation } from "./ManyToManyRelation";
import { ManyToOneRelation } from "./ManyToOneRelation";
import { Model } from "./Model";
import { OneToManyRelation } from "./OneToManyRelation";

describe("Model", () => {
    // Create a new class
    class TestModel extends Model {
        static table = "testModels";

        @column({ primary: true, type: "integer" })
        id: number | null = null;

        @column({ type: "string" })
        name: string;

        @column({ type: "integer" })
        count: number;

        @column({ type: "boolean" })
        isActive: boolean;

        @column({ type: "datetime" })
        createdOn: Date;

        @column({ type: "date", nullable: true })
        birthDay: Date | null = null;

        @column({ foreignKey: TestModel.parent, type: "integer", nullable: true })
        parentId: number | null = null; // null = no address

        static parent = new ManyToOneRelation(TestModel, "parent");
        static friends = new ManyToManyRelation(TestModel, TestModel, "friends");
        static sortedFriends = new ManyToManyRelation(TestModel, TestModel, "sortedFriends").setSort("priority");
        static children = new OneToManyRelation(TestModel, TestModel, "children", "parentId");
        static sortedChildren = new OneToManyRelation(TestModel, TestModel, "sortedChildren", "parentId").setSort("count");
    }

    test("Not possible to choose own primary key for integer type primary", async () => {
        const m = new TestModel();
        m.id = 123;
        m.name = "My name";
        m.count = 1;
        m.isActive = true;
        m.createdOn = new Date();
        m.birthDay = new Date(1990, 0, 1);
        await expect(m.save()).rejects.toThrow(/primary/i);
    });

    test("Creating a model requires to set all properties", async () => {
        const m = new TestModel();
        m.name = "My name";
        m.isActive = true;
        m.createdOn = new Date();
        await expect(m.save()).rejects.toThrow(/count/i);
    });

    test("Saving a new instance", async () => {
        const m = new TestModel();
        m.name = "My name";
        m.isActive = true;
        m.count = 1;
        m.createdOn = new Date();
        // MySQL cannot save milliseconds. Data is rounded if not set to zero.
        m.createdOn.setMilliseconds(0);

        m.birthDay = new Date(1990, 0, 1);
        await m.save();
        expect(m.existsInDatabase).toEqual(true);
        expect(m.id).toBeGreaterThanOrEqual(1);

        const [rows] = await Database.select("SELECT * from testModels where id = ?", [m.id]);
        expect(rows).toHaveLength(1);
        const row = rows[0];
        expect(row).toHaveProperty("testModels");
        const selected = TestModel.fromRow(row["testModels"]) as any;

        expect(selected).toEqual(m);
        expect(selected.id).toEqual(m.id);
    });

    test("You cannot set a relation directly", async () => {
        const other = new TestModel();
        other.name = "My parent";
        other.isActive = true;
        other.count = 1;
        other.createdOn = new Date();
        await other.save();
        expect(other.existsInDatabase).toEqual(true);

        const m = new TestModel();
        m.name = "My name";
        m.isActive = true;
        m.count = 1;
        m.createdOn = new Date();
        // MySQL cannot save milliseconds. Data is rounded if not set to zero.
        m.createdOn.setMilliseconds(0);

        m.birthDay = new Date(1990, 0, 1);

        // setRelation is the correct way to do it (it would throw now):
        //m.setRelation(TestModel.parent, other);
        // but we test what happens if we set the relation the wrong way
        (m as any).parent = other;

        await expect(m.save()).rejects.toThrow(/foreign key/i);
    });

    test("Save before setting a many to one relation", () => {
        const other = new TestModel();
        other.name = "My parent";
        other.isActive = true;
        other.count = 1;
        other.createdOn = new Date();

        const m = new TestModel();
        m.name = "My name";
        m.isActive = true;
        m.count = 1;
        m.createdOn = new Date();
        // MySQL cannot save milliseconds. Data is rounded if not set to zero.
        m.createdOn.setMilliseconds(0);

        m.birthDay = new Date(1990, 0, 1);

        expect(() => {
            m.setRelation(TestModel.parent, other);
        }).toThrow(/not yet saved/i);
    });

    test("Setting a many to one relation", async () => {
        const other = new TestModel();
        other.name = "My parent";
        other.isActive = true;
        other.count = 1;
        other.createdOn = new Date();
        other.createdOn.setMilliseconds(0);
        await other.save();
        expect(other.existsInDatabase).toEqual(true);
        if (!other.id) {
            throw new Error("Save failed");
        }

        const counts = [4, 5, 1];

        for (const count of counts) {
            const m = new TestModel() as any;
            m.name = "My name " + count;
            m.isActive = true;
            m.count = count;
            m.createdOn = new Date();
            // MySQL cannot save milliseconds. Data is rounded if not set to zero.
            m.createdOn.setMilliseconds(0);

            m.birthDay = new Date(1990, 0, 1);
            m.setRelation(TestModel.parent, other);
            expect(m.parent.id).toEqual(other.id);
            expect(m.parentId).toEqual(other.id);

            await m.save();
            expect(m.existsInDatabase).toEqual(true);
            expect(m.parentId).toEqual(other.id);
            expect(m.parent.id).toEqual(other.id);
        }

        // Check other way
        const o = await TestModel.getByID(other.id);
        expect(o).toEqual(other);
        if (!o) {
            throw new Error("Save failed");
        }

        const children = await TestModel.children.load(o);
        expect(children).toHaveLength(3);
        expect(TestModel.children.isLoaded(o)).toBeTrue();

        const sortedChildren = await TestModel.sortedChildren.load(o);
        expect(sortedChildren).toHaveLength(3);
        expect(TestModel.sortedChildren.isLoaded(o)).toBeTrue();
        expect(sortedChildren.map((c) => c.count)).toEqual([1, 4, 5]);
    });

    test("Setting a many to one relation by ID", async () => {
        const other = new TestModel();
        other.name = "My parent";
        other.isActive = true;
        other.count = 1;
        other.createdOn = new Date();
        await other.save();
        expect(other.existsInDatabase).toEqual(true);
        expect(other.parentId).toEqual(null);
        expect(other.birthDay).toEqual(null);

        const m = new TestModel() as any;
        m.name = "My name";
        m.isActive = true;
        m.count = 1;
        m.createdOn = new Date();
        // MySQL cannot save milliseconds. Data is rounded if not set to zero.
        m.createdOn.setMilliseconds(0);

        m.birthDay = new Date(1990, 0, 1);
        m.parentId = other.id;

        await m.save();
        expect(m.existsInDatabase).toEqual(true);
        expect(m.parentId).toEqual(other.id);
        expect(TestModel.parent.isLoaded(m)).toEqual(false);
        expect(TestModel.parent.isSet(m)).toEqual(false);

        const [rows] = await Database.select("SELECT * from testModels where id = ?", [m.id]);
        expect(rows).toHaveLength(1);
        const row = rows[0];
        expect(row).toHaveProperty("testModels");
        const selected = TestModel.fromRow(row["testModels"]) as any;

        expect(TestModel.parent.isLoaded(selected)).toEqual(false);
        expect(TestModel.parent.isSet(selected)).toEqual(false);
        expect(selected.parentId).toEqual(other.id);
    });

    test("Clearing a many to one relation", async () => {
        const other = new TestModel();
        other.name = "My parent";
        other.isActive = true;
        other.count = 1;
        other.createdOn = new Date();
        await other.save();
        expect(other.existsInDatabase).toEqual(true);

        const m = new TestModel() as any;
        m.name = "My name";
        m.isActive = true;
        m.count = 1;
        m.createdOn = new Date();
        m.parentId = other.id;
        await m.save();
        expect(m.existsInDatabase).toEqual(true);
        expect(m.parentId).toEqual(other.id);

        m.setOptionalRelation(TestModel.parent, null);
        expect(m.parentId).toEqual(null);
        expect(m.parent).toEqual(null);
        await m.save();
        expect(m.parentId).toEqual(null);
        expect(m.parent).toEqual(null);

        const [rows] = await Database.select("SELECT * from testModels where id = ?", [m.id]);
        expect(rows).toHaveLength(1);
        const row = rows[0];
        expect(row).toHaveProperty("testModels");
        const selected = TestModel.fromRow(row["testModels"]) as any;
        expect(selected.parentId).toEqual(null);
    });

    test("Clearing a many to one relation by ID", async () => {
        const other = new TestModel();
        other.name = "My parent";
        other.isActive = true;
        other.count = 1;
        other.createdOn = new Date();
        expect(await other.save()).toEqual(true);
        expect(other.existsInDatabase).toEqual(true);

        const m = new TestModel() as any;
        m.name = "My name";
        m.isActive = true;
        m.count = 1;
        m.createdOn = new Date();
        m.parentId = other.id;
        expect(await m.save()).toEqual(true);

        expect(m.existsInDatabase).toEqual(true);
        expect(m.parentId).toEqual(other.id);

        m.parentId = null;
        expect(await m.save()).toEqual(true);
        expect(m.parentId).toEqual(null);

        const [rows] = await Database.select("SELECT * from testModels where id = ?", [m.id]);
        expect(rows).toHaveLength(1);
        const row = rows[0];
        expect(row).toHaveProperty("testModels");
        const selected = TestModel.fromRow(row["testModels"]) as any;
        expect(selected.parentId).toEqual(null);
    });

    test("No query if no changes", async () => {
        const other = new TestModel();
        other.name = "No query if no changes";
        other.isActive = true;
        other.count = 1;
        other.createdOn = new Date();

        const firstSave = await other.save();
        expect(firstSave).toEqual(true);

        expect(other.existsInDatabase).toEqual(true);
        expect(other.parentId).toEqual(null);
        expect(other.birthDay).toEqual(null);

        other.count = 1;
        const saved = await other.save();
        expect(saved).toEqual(false);
    });

    test("Update a model", async () => {
        const other = new TestModel();
        other.name = "Update a model";
        other.isActive = true;
        other.count = 1;
        other.createdOn = new Date();

        expect(other.existsInDatabase).toEqual(false);
        expect(await other.save()).toEqual(true);
        expect(other.existsInDatabase).toEqual(true);

        other.count = 2;
        expect(await other.save()).toEqual(true);
        expect(other.existsInDatabase).toEqual(true);
    });

    let friend1, friend2, friend3, meWithoutFriends: TestModel;
    let meWithFriends: TestModel & { friends: TestModel[] };
    test("Set a many to many relationship", async () => {
        friend1 = new TestModel();
        friend1.name = "Friend 1";
        friend1.isActive = true;
        friend1.count = 1;
        friend1.createdOn = new Date();

        expect(await friend1.save()).toEqual(true);

        friend2 = new TestModel();
        friend2.name = "Friend 2";
        friend2.isActive = true;
        friend2.count = 2;
        friend2.createdOn = new Date();

        expect(await friend2.save()).toEqual(true);

        friend3 = new TestModel();
        friend3.name = "Friend 3";
        friend3.isActive = true;
        friend3.count = 3;
        friend3.createdOn = new Date();

        expect(await friend3.save()).toEqual(true);

        meWithFriends = new TestModel().setManyRelation(TestModel.friends, []);
        meWithFriends.name = "Me";
        meWithFriends.isActive = true;
        meWithFriends.count = 1;
        meWithFriends.createdOn = new Date();

        expect(await meWithFriends.save()).toEqual(true);

        await TestModel.friends.link(meWithFriends, [friend1, friend2]);
        if (TestModel.friends.isLoaded(meWithFriends)) {
            expect(meWithFriends.friends).toHaveLength(2);
            expect(meWithFriends.friends[0].id).toEqual(friend1.id);
            expect(meWithFriends.friends[1].id).toEqual(friend2.id);
        } else {
            expect("other friends not loaded").toEqual("other friends loaded");
        }

        // Check also saved in database
        const [rows] = await Database.select("SELECT * from testModels " + TestModel.friends.joinQuery("testModels", "friends") + " where testModels.id = ?", [
            meWithFriends.id,
        ]);

        const _meWithoutFriends = TestModel.fromRow(rows[0]["testModels"]);
        expect(_meWithoutFriends).toBeDefined();
        if (!_meWithoutFriends) return;
        meWithoutFriends = _meWithoutFriends;
        expect(meWithoutFriends.id).toEqual(meWithFriends.id);

        const friends = TestModel.fromRows(rows, "friends");
        expect(friends).toHaveLength(2);
        expect(friends[0].id).toEqual(friend1.id);
        expect(friends[1].id).toEqual(friend2.id);
    });

    test("Set a sorted many to many relationship", async () => {
        const friend1 = new TestModel();
        friend1.name = "Friend 1";
        friend1.isActive = true;
        friend1.count = 1;
        friend1.createdOn = new Date();

        expect(await friend1.save()).toEqual(true);

        const friend2 = new TestModel();
        friend2.name = "Friend 2";
        friend2.isActive = true;
        friend2.count = 2;
        friend2.createdOn = new Date();

        expect(await friend2.save()).toEqual(true);

        const friend3 = new TestModel();
        friend3.name = "Friend 3";
        friend3.isActive = true;
        friend3.count = 3;
        friend3.createdOn = new Date();

        expect(await friend3.save()).toEqual(true);

        const meWithFriends = new TestModel().setManyRelation(TestModel.sortedFriends, []);
        meWithFriends.name = "Me";
        meWithFriends.isActive = true;
        meWithFriends.count = 1;
        meWithFriends.createdOn = new Date();

        expect(await meWithFriends.save()).toEqual(true);

        await TestModel.sortedFriends.link(meWithFriends, [friend1, friend2, friend3], { priority: [6, 2, 1] });
        if (TestModel.sortedFriends.isLoaded(meWithFriends)) {
            expect(meWithFriends.sortedFriends).toHaveLength(3);
            expect(meWithFriends.sortedFriends[0].id).toEqual(friend1.id);
            expect(meWithFriends.sortedFriends[1].id).toEqual(friend2.id);
            expect(meWithFriends.sortedFriends[2].id).toEqual(friend3.id);
        } else {
            expect("other friends not loaded").toEqual("other friends loaded");
        }

        // Check also saved in database
        const [rows] = await Database.select(
            "SELECT * from testModels " +
                TestModel.sortedFriends.joinQuery("testModels", "sortedFriends") +
                " where testModels.id = ? " +
                TestModel.sortedFriends.orderByQuery("testModels", "sortedFriends"),
            [meWithFriends.id]
        );

        const meWithoutFriends = TestModel.fromRow(rows[0]["testModels"]);
        expect(meWithoutFriends).toBeDefined();
        if (!meWithoutFriends) return;
        expect(meWithoutFriends.id).toEqual(meWithFriends.id);

        const friends = TestModel.fromRows(rows, "sortedFriends");
        expect(friends).toHaveLength(3);
        expect(friends[0].id).toEqual(friend3.id);
        expect(friends[1].id).toEqual(friend2.id);
        expect(friends[2].id).toEqual(friend1.id);

        const _friends = await TestModel.sortedFriends.load(meWithFriends);
        expect(_friends[0].id).toEqual(friend3.id);
        expect(_friends[1].id).toEqual(friend2.id);
        expect(_friends[2].id).toEqual(friend1.id);

        await TestModel.sortedFriends.setLinkTable(meWithFriends, friend3, { priority: 3 });

        const __friends = await TestModel.sortedFriends.load(meWithFriends);
        expect(__friends[0].id).toEqual(friend2.id);
        expect(__friends[1].id).toEqual(friend3.id);
        expect(__friends[2].id).toEqual(friend1.id);
    });

    test("Unlink a many to many relationship", async () => {
        // Now unlink one
        await TestModel.friends.unlink(meWithFriends, friend1);
        if (TestModel.friends.isLoaded(meWithFriends)) {
            expect(meWithFriends.friends).toHaveLength(1);
            expect(meWithFriends.friends[0].id).toEqual(friend2.id);
        } else {
            expect("other friends not loaded").toEqual("other friends loaded");
        }

        const [rows] = await Database.select("SELECT * from testModels " + TestModel.friends.joinQuery("testModels", "friends") + " where testModels.id = ?", [
            meWithFriends.id,
        ]);

        const meAgain = TestModel.fromRow(rows[0]["testModels"]);
        expect(meAgain).toBeDefined();
        if (!meAgain) return;
        expect(meAgain.id).toEqual(meWithFriends.id);

        const friendsAgain = TestModel.fromRows(rows, "friends");
        expect(friendsAgain).toHaveLength(1);
        expect(friendsAgain[0].id).toEqual(friend2.id);
    });

    test("Clear a many to many relationship", async () => {
        // Now unlink one
        await TestModel.friends.clear(meWithFriends);
        if (TestModel.friends.isLoaded(meWithFriends)) {
            expect(meWithFriends.friends).toHaveLength(0);
        } else {
            expect("other friends not loaded").toEqual("other friends loaded");
        }

        const [rows] = await Database.select("SELECT * from testModels " + TestModel.friends.joinQuery("testModels", "friends") + " where testModels.id = ?", [
            meWithFriends.id,
        ]);

        const meAgain = TestModel.fromRow(rows[0]["testModels"]);
        expect(meAgain).toBeDefined();
        if (!meAgain) return;
        expect(meAgain.id).toEqual(meWithFriends.id);

        const friendsAgain = TestModel.fromRows(rows, "friends");
        expect(friendsAgain).toHaveLength(0);
    });

    test("Link a not loaded many to many relation", async () => {
        // Now unlink one
        await TestModel.friends.link(meWithoutFriends, [friend3, friend2, friend1]);
        expect(TestModel.friends.isLoaded(meWithoutFriends)).toEqual(false);

        const [rows] = await Database.select("SELECT * from testModels " + TestModel.friends.joinQuery("testModels", "friends") + " where testModels.id = ?", [
            meWithoutFriends.id,
        ]);

        const meAgain = TestModel.fromRow(rows[0]["testModels"]);
        expect(meAgain).toBeDefined();
        if (!meAgain) return;
        expect(meAgain.id).toEqual(meWithoutFriends.id);

        const friendsAgain = TestModel.fromRows(rows, "friends");
        expect(friendsAgain).toHaveLength(3);
        expect(friendsAgain.map((f) => f.id)).toIncludeSameMembers([friend3.id, friend2.id, friend1.id]);
    });

    test("Unlink a not loaded many to many relation", async () => {
        // Now unlink one
        await TestModel.friends.unlink(meWithoutFriends, friend3);
        expect(TestModel.friends.isLoaded(meWithoutFriends)).toEqual(false);

        const [rows] = await Database.select("SELECT * from testModels " + TestModel.friends.joinQuery("testModels", "friends") + " where testModels.id = ?", [
            meWithoutFriends.id,
        ]);

        const meAgain = TestModel.fromRow(rows[0]["testModels"]);
        expect(meAgain).toBeDefined();
        if (!meAgain) return;
        expect(meAgain.id).toEqual(meWithoutFriends.id);

        const friendsAgain = TestModel.fromRows(rows, "friends");
        expect(friendsAgain.map((f) => f.id)).toIncludeSameMembers([friend2.id, friend1.id]);
    });

    test("Load a M2M relation", async () => {
        // Get a clean one, because we don't want to affect the other tests
        const [rows] = await Database.select("SELECT * from testModels where id = ? LIMIT 1", [meWithFriends.id]);
        expect(rows).toHaveLength(1);
        const row = rows[0];
        expect(row).toHaveProperty("testModels");
        const selected = TestModel.fromRow(row["testModels"]) as any;
        expect(selected).toBeDefined();

        expect(TestModel.friends.isLoaded(selected)).toEqual(false);
        const friends = await TestModel.friends.load(selected);
        expect(TestModel.friends.isLoaded(selected)).toEqual(true);
        expect(selected.friends).toEqual(friends);
        expect(friends.map((f) => f.id)).toIncludeSameMembers([friend2.id, friend1.id]);
    });

    test("Clear a not loaded many to many relation", async () => {
        // Now unlink one
        await TestModel.friends.clear(meWithoutFriends);
        expect(TestModel.friends.isLoaded(meWithoutFriends)).toEqual(true); // should be true, because we can automatically load the relation if it is not yet loaded
        expect((meWithoutFriends as any).friends).toHaveLength(0);

        const [rows] = await Database.select("SELECT * from testModels " + TestModel.friends.joinQuery("testModels", "friends") + " where testModels.id = ?", [
            meWithoutFriends.id,
        ]);

        const meAgain = TestModel.fromRow(rows[0]["testModels"]);
        expect(meAgain).toBeDefined();
        if (!meAgain) return;
        expect(meAgain.id).toEqual(meWithoutFriends.id);

        const friendsAgain = TestModel.fromRows(rows, "friends");
        expect(friendsAgain).toHaveLength(0);
    });

    test("Load an empty M2M relation", async () => {
        // Get a clean one, because we don't want to affect the other tests
        const [rows] = await Database.select("SELECT * from testModels where id = ? LIMIT 1", [meWithFriends.id]);
        expect(rows).toHaveLength(1);
        const row = rows[0];
        expect(row).toHaveProperty("testModels");
        const selected = TestModel.fromRow(row["testModels"]) as any;
        expect(selected).toBeDefined();

        expect(TestModel.friends.isLoaded(selected)).toEqual(false);
        const friends = await TestModel.friends.load(selected);
        expect(TestModel.friends.isLoaded(selected)).toEqual(true);
        expect(selected.friends).toEqual(friends);
        expect(friends).toBeEmpty();
    });

    test("You can't set many to many if not yet saved", async () => {
        const friend1 = new TestModel();
        friend1.name = "Friend 1";
        friend1.isActive = true;
        friend1.count = 1;
        friend1.createdOn = new Date();

        expect(await friend1.save()).toEqual(true);

        const friend2 = new TestModel();
        friend2.name = "Friend 2";
        friend2.isActive = true;
        friend2.count = 1;
        friend2.createdOn = new Date();

        const other = new TestModel().setManyRelation(TestModel.friends, []);
        other.name = "Me";
        other.isActive = true;
        other.count = 1;
        other.createdOn = new Date();

        expect(await other.save()).toEqual(true);
        await expect(TestModel.friends.link(other, [friend1, friend2])).rejects.toThrow(/not saved yet/);
    });

    test("Get by IDs", async () => {
        const models = await TestModel.getByIDs(friend1.id, friend2.id, friend3.id, meWithFriends.id!);
        expect(models).toHaveLength(4);
        expect(models.map((e) => e.id)).toIncludeAllMembers([friend1.id, friend2.id, friend3.id, meWithFriends.id!]);
    });
});
