import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTile } from "../tiles/tile.ts";
import { renderAsciiView } from "./render.ts";
import {
	type Actor,
	actorAt,
	actorGlyph,
	actorSees,
	addActor,
	cellState,
	createView,
	forgetAll,
	moveActor,
	removeActor,
	revealAll,
	revealArea,
	revealTile,
	visibleActors,
	withActors,
} from "./view.ts";

const twoRooms = parseTile({
	id: "two-rooms",
	name: "Two Rooms",
	art: ["#########", "#...#...#", "#...+...#", "#...#...#", "#########"],
});

const pc: Actor = { id: "brannoc", name: "Brannoc", x: 2, y: 2, kind: "pc" };
const foe: Actor = { id: "goblin", name: "Goblin", x: 6, y: 2, kind: "foe" };

describe("actors", () => {
	it("has a default glyph per kind", () => {
		assert.equal(actorGlyph(pc), "@");
		assert.equal(actorGlyph(foe), "!");
		assert.equal(actorGlyph({ ...pc, glyph: "B" }), "B");
	});

	it("assumes party members see and others do not", () => {
		assert.equal(actorSees(pc), true);
		assert.equal(actorSees({ ...pc, kind: "ally" }), true);
		assert.equal(actorSees(foe), false);
		assert.equal(actorSees({ ...foe, sees: true }), true);
	});
});

describe("createView", () => {
	it("starts with nothing known", () => {
		const view = createView(twoRooms);
		assert.equal(view.explored.size, 0);
		assert.equal(view.visible.size, 0);
		assert.equal(cellState(view, 2, 2), "unknown");
	});

	it("computes visibility immediately when actors are supplied", () => {
		const view = createView(twoRooms, { actors: [pc] });
		assert.equal(cellState(view, 2, 2), "visible");
		assert.equal(cellState(view, 6, 2), "unknown", "the far room is behind a closed door");
	});

	it("can start fully revealed, for a GM view", () => {
		const view = createView(twoRooms, { revealAll: true });
		assert.equal(cellState(view, 6, 2), "visible");
	});

	it("never marks void as known", () => {
		const gappy = parseTile({ id: "g", name: "G", art: ["## ##", "#. .#", "## ##"] });
		const view = createView(gappy, { revealAll: true });
		assert.equal(cellState(view, 2, 1), "unknown");
	});
});

describe("the three states", () => {
	it("remembers terrain after the party moves away", () => {
		let view = createView(twoRooms, { actors: [pc] });
		assert.equal(cellState(view, 1, 1), "visible");
		// Step through the door into the far room.
		view = moveActor(view, "brannoc", { x: 6, y: 2 });
		assert.equal(cellState(view, 1, 1), "explored", "the first room should be remembered");
		assert.equal(cellState(view, 6, 1), "visible", "the second room should now be in sight");
	});

	it("forgets nothing on its own", () => {
		let view = createView(twoRooms, { actors: [pc] });
		const exploredBefore = view.explored.size;
		view = moveActor(view, "brannoc", { x: 6, y: 2 });
		assert.ok(view.explored.size > exploredBefore, "explored should only grow");
	});

	it("clears visibility when no one is left who can see", () => {
		let view = createView(twoRooms, { actors: [pc] });
		view = removeActor(view, "brannoc");
		assert.equal(view.visible.size, 0);
		assert.ok(view.explored.size > 0, "but what was seen stays explored");
	});

	it("can be told to forget everything", () => {
		const view = forgetAll(createView(twoRooms, { revealAll: true }));
		assert.equal(view.explored.size, 0);
		assert.equal(view.visible.size, 0);
	});

	it("reveals an area without anyone standing in it", () => {
		const view = revealArea(createView(twoRooms), { x: 5, y: 1, width: 3, height: 3 });
		assert.equal(cellState(view, 6, 2), "explored");
		assert.equal(cellState(view, 2, 2), "unknown");
	});

	it("clamps a revealed area to the map", () => {
		const view = revealArea(createView(twoRooms), { x: -5, y: -5, width: 100, height: 100 });
		assert.equal(cellState(view, 0, 0), "explored");
	});

	it("reveals one tile of a composed map by lattice position", () => {
		const big = parseTile({
			id: "big",
			name: "Big",
			art: Array.from({ length: 13 }, () => ".".repeat(13)),
		});
		const view = revealTile(createView(big), 1, 0);
		assert.equal(cellState(view, 7, 1), "explored");
		assert.equal(cellState(view, 1, 1), "unknown");
	});
});

describe("actor management", () => {
	it("adds, moves and removes", () => {
		let view = createView(twoRooms, { actors: [pc] });
		view = addActor(view, foe);
		assert.equal(view.actors.length, 2);
		assert.deepEqual(actorAt(view, 6, 2)?.id, "goblin");
		view = moveActor(view, "goblin", { x: 5, y: 1 });
		assert.equal(actorAt(view, 5, 1)?.id, "goblin");
		view = removeActor(view, "goblin");
		assert.equal(view.actors.length, 1);
	});

	it("refuses a duplicate id", () => {
		const view = createView(twoRooms, { actors: [pc] });
		assert.throws(() => addActor(view, pc), /already on the map/);
	});

	it("refuses to move an actor that is not there", () => {
		const view = createView(twoRooms, { actors: [pc] });
		assert.throws(() => moveActor(view, "nobody", { x: 1, y: 1 }), /No actor with id/);
	});

	it("does not mutate the view it was given", () => {
		const view = createView(twoRooms, { actors: [pc] });
		const moved = moveActor(view, "brannoc", { x: 6, y: 2 });
		assert.equal(view.actors[0].x, 2, "the original view changed");
		assert.notEqual(moved.actors[0].x, view.actors[0].x);
	});
});

describe("visibleActors", () => {
	it("hides a creature in an unseen room", () => {
		const view = withActors(createView(twoRooms), [pc, foe]);
		assert.deepEqual(
			visibleActors(view).map((actor) => actor.id),
			["brannoc"],
			"the goblin is behind a closed door",
		);
	});

	it("shows a creature once it is in sight", () => {
		const view = withActors(createView(twoRooms), [pc, { ...foe, x: 3, y: 2 }]);
		assert.deepEqual(visibleActors(view).map((actor) => actor.id).sort(), ["brannoc", "goblin"]);
	});

	it("always includes the party, wherever they are", () => {
		const view = withActors(createView(twoRooms), [pc, { ...pc, id: "second", x: 6, y: 2 }]);
		assert.equal(visibleActors(view).length, 2);
	});

	it("does not remember a creature in an explored room", () => {
		// Terrain is remembered; creatures are not, because they move.
		let view = withActors(createView(twoRooms), [{ ...pc, x: 6, y: 2 }, { ...foe, x: 7, y: 1 }]);
		assert.equal(visibleActors(view).length, 2);
		view = moveActor(view, "brannoc", { x: 2, y: 2 });
		assert.equal(cellState(view, 7, 1), "explored");
		assert.deepEqual(visibleActors(view).map((a) => a.id), ["brannoc"]);
	});
});

describe("renderAsciiView", () => {
	it("blanks the unknown, draws the explored, and puts tokens on the visible", () => {
		const view = withActors(createView(twoRooms), [pc]);
		const text = renderAsciiView(view, { trimTrailing: false });
		const lines = text.split("\n");
		assert.equal(lines[2][2], "@", "the party member should be drawn");
		assert.equal(lines[2][6], " ", "the unseen room should be blank");
	});

	it("uses a custom unknown glyph", () => {
		const view = withActors(createView(twoRooms), [pc]);
		const text = renderAsciiView(view, { unknownGlyph: "?", trimTrailing: false });
		assert.equal(text.split("\n")[2][6], "?");
	});

	it("rejects a multi-character unknown glyph", () => {
		const view = createView(twoRooms);
		assert.throws(() => renderAsciiView(view, { unknownGlyph: "??" }), /exactly one character/);
	});

	it("can omit tokens", () => {
		const view = withActors(createView(twoRooms), [pc]);
		const text = renderAsciiView(view, { tokens: false, trimTrailing: false });
		assert.equal(text.split("\n")[2][2], ".", "terrain should show through");
	});

	it("crops to a viewport", () => {
		const view = createView(twoRooms, { revealAll: true });
		const text = renderAsciiView(view, { viewport: { x: 0, y: 0, width: 4, height: 2 } });
		assert.deepEqual(text.split("\n"), ["####", "#..."]);
	});

	it("does not draw a creature standing in an explored but unseen cell", () => {
		const view = withActors(createView(twoRooms, { revealAll: true }), [pc, foe]);
		// Reveal-all makes everything visible, so drop back to actor-driven sight.
		const fogged = withActors({ ...view, visible: new Set(), explored: view.explored }, [pc, foe]);
		const text = renderAsciiView(fogged, { trimTrailing: false });
		assert.notEqual(text.split("\n")[2][6], "!", "a hidden goblin must not be drawn");
	});
});
