import { createHash } from "node:crypto";
// web/curve.mjs
/** Curve Editor data and rendering math. Curve records use ordinary Ink tables. */
var TABLE_KIND = "ink-table";
var ROW_KIND = "ink-table-row";
var LIMITS = {
	curves: 500,
	points: 64,
	coordinate: 1e9,
	pointJSON: 4096
};
var MODES = [
	"linear",
	"pchip",
	"step"
];
var OUTSIDE = [
	"clamp",
	"linear",
	"repeat",
	"pingpong"
];
var fail = (message, status = 400) => Object.assign(Error(message), { status });
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function key(value) {
	if (!/^[a-z][a-z0-9_]{0,47}$/.test(value || "")) throw fail("Use a key starting with a lowercase letter, then letters, numbers or underscores (up to 48).");
	return value;
}
function point(input) {
	if (!input || typeof input !== "object" || !/^[a-zA-Z0-9_-]{1,32}$/.test(input.id || "")) throw fail("Invalid point identity.");
	const { x, y } = input;
	if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > LIMITS.coordinate || Math.abs(y) > LIMITS.coordinate) throw fail("Use finite point coordinates between −1 billion and 1 billion.");
	return {
		id: input.id,
		x: Object.is(x, -0) ? 0 : x,
		y: Object.is(y, -0) ? 0 : y
	};
}
function normalize(input) {
	if (!input || typeof input !== "object") throw fail("Curve data must be an object.");
	if (!MODES.includes(input.interpolation) || !OUTSIDE.includes(input.outside)) throw fail("Choose a supported interpolation and outside mode.");
	const text = (k, fallback, max) => {
		const v = input[k] ?? fallback;
		if (typeof v !== "string" || v.length > max) throw fail("Invalid " + k);
		return v;
	};
	if (!Array.isArray(input.points) || input.points.length < 2 || input.points.length > LIMITS.points) throw fail("Use 2–64 points.");
	const points = input.points.map(point).sort((a, b) => a.x - b.x);
	if (new Set(points.map((p) => p.id)).size !== points.length) throw fail("Point identities must be unique.");
	for (let i = 1; i < points.length; i++) if (points[i].x - points[i - 1].x < 1e-6) throw fail("Point X coordinates must be distinct and at least 0.000001 apart.");
	if (JSON.stringify(points).length > LIMITS.pointJSON) throw fail("Keep point data below 4,096 characters.");
	return {
		name: text("name", "Untitled curve", 100),
		description: text("description", "", 1e3),
		x_label: text("x_label", "Input", 60),
		y_label: text("y_label", "Value", 60),
		interpolation: input.interpolation,
		outside: input.outside,
		points
	};
}
var SCHEMA = {
	format: TABLE_KIND,
	version: 1,
	key: "curves",
	columns: [
		{
			key: "name",
			type: "text",
			default: ""
		},
		{
			key: "description",
			type: "text",
			default: ""
		},
		{
			key: "x_label",
			type: "text",
			default: "Input"
		},
		{
			key: "y_label",
			type: "text",
			default: "Value"
		},
		{
			key: "interpolation",
			type: "text",
			default: "linear"
		},
		{
			key: "outside",
			type: "text",
			default: "clamp"
		},
		{
			key: "points",
			type: "json",
			nullable: true,
			default: [{
				id: "p0",
				x: 0,
				y: 0
			}, {
				id: "p1",
				x: 1,
				y: 1
			}]
		}
	]
};
var PRESETS = {
	linear: {
		name: "Linear ramp",
		x_label: "Input",
		y_label: "Value",
		interpolation: "linear",
		points: [[0, 0], [1, 1]]
	},
	ease_in: {
		name: "Ease in",
		x_label: "Time",
		y_label: "Amount",
		interpolation: "pchip",
		points: [
			[0, 0],
			[.4, .06],
			[.75, .4],
			[1, 1]
		]
	},
	ease_out: {
		name: "Ease out",
		x_label: "Time",
		y_label: "Amount",
		interpolation: "pchip",
		points: [
			[0, 0],
			[.25, .6],
			[.6, .94],
			[1, 1]
		]
	},
	bell: {
		name: "Bell",
		x_label: "Time",
		y_label: "Amount",
		interpolation: "pchip",
		points: [
			[0, 0],
			[.25, .6],
			[.5, 1],
			[.75, .6],
			[1, 0]
		]
	},
	enemy_hp: {
		name: "Enemy health",
		x_label: "Level",
		y_label: "HP",
		interpolation: "pchip",
		points: [
			[1, 30],
			[5, 60],
			[10, 125],
			[20, 350],
			[40, 1400]
		]
	},
	xp_cost: {
		name: "XP cost",
		x_label: "Level",
		y_label: "XP",
		interpolation: "pchip",
		points: [
			[1, 100],
			[5, 250],
			[10, 650],
			[20, 2200],
			[50, 14e3]
		]
	},
	cooldown: {
		name: "Cooldown",
		x_label: "Skill level",
		y_label: "Seconds",
		interpolation: "pchip",
		points: [
			[1, 12],
			[10, 8],
			[25, 4.5],
			[50, 2]
		]
	}
};
function preset(id) {
	const p = PRESETS[id];
	if (!p) throw fail("Choose a preset.");
	return normalize({
		...p,
		description: "",
		outside: "clamp",
		points: p.points.map(([x, y], i) => ({
			id: "p" + i,
			x,
			y
		}))
	});
}
function pointChange(values, action) {
	const c = normalize(values), points = c.points.map((p) => ({ ...p }));
	if (action.type === "add") {
		const next = point(action.point);
		const existing = points.find((p) => p.id === next.id);
		if (existing) {
			if (same(existing, next)) return c;
			throw fail("That point identity already exists.", 409);
		}
		points.push(next);
	} else {
		const index = points.findIndex((p) => p.id === action.id);
		if (index < 0) throw fail("This point was removed by another editor.", 409);
		if (!same(points[index], point(action.expected))) throw fail("This point changed in another editor. Its newer value was preserved.", 409);
		if (action.type === "remove") points.splice(index, 1);
		else if (action.type === "set") points[index] = point({
			...action.point,
			id: action.id
		});
		else throw fail("Unknown point operation.");
	}
	return normalize({
		...c,
		points
	});
}
// src/service.mjs
function createService() {
	let tail = Promise.resolve();
	const serial = (fn) => {
		const task = tail.catch(() => {}).then(fn);
		tail = task.catch(() => {});
		return task;
	}, hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 32);
	const get = async (ink, id) => {
		try {
			return await ink.data.get(id);
		} catch (e) {
			if (e.status === 404) return null;
			throw e;
		}
	};
	async function ensure(ink, namespace) {
		const tableId = hash(namespace + "\0table\0curves"), prior = await get(ink, tableId);
		if (prior) {
			if (prior.namespace !== namespace || prior.kind !== "ink-table" || prior.archived || !same(JSON.parse(prior.body), SCHEMA)) throw fail("The curves table has an incompatible schema.", 409);
			return tableId;
		}
		await ink.data.create({
			id: tableId,
			kind: TABLE_KIND,
			title: "Curves",
			tags: ["ink-tables", "ink-table:" + tableId],
			body: JSON.stringify(SCHEMA)
		});
		return tableId;
	}
	async function row(ink, namespace, id) {
		if (!/^[a-f0-9]{32}$/.test(id || "")) throw fail("Invalid curve identity.");
		const record = await get(ink, id);
		if (!record || record.namespace !== namespace || record.kind !== "ink-table-row") throw fail("Curve not found.", 404);
		const b = JSON.parse(record.body);
		if (b.format !== "ink-table-row" || b.version !== 1 || b.tableId !== hash(namespace + "\0table\0curves")) throw fail("This record is not in the curves table.", 400);
		return {
			record,
			body: b,
			values: normalize(b.values)
		};
	}
	return async function handle(request, { ink, namespace }) {
		try {
			const path = new URL(request.url).pathname;
			if (path === "/health") return Response.json({ ok: true });
			if (request.method !== "POST") throw fail("Unknown curve action.", 404);
			const input = await request.json();
			if (!input || typeof input !== "object" || Array.isArray(input) || !input.__inkCaller) throw fail("Open Curve Editor in your signed-in Ink account.", 401);
			if (!(await ink.request("apps/" + namespace + "/caller", {
				method: "POST",
				body: {
					assertion: input.__inkCaller,
					path: new URL(request.url).pathname + new URL(request.url).search,
					method: request.method,
					body: input
				}
			})).accountId) throw fail("A signed-in person is required to edit curves.", 403);
			return await serial(async () => {
				if (path === "/curves/create") {
					const curveKey = key(input.key), values = input.values ? normalize(input.values) : preset(input.preset || "linear");
					if (input.name !== void 0) values.name = String(input.name).trim();
					const valid = normalize(values);
					if (!valid.name.trim()) throw fail("Enter a curve name.");
					const tableId = await ensure(ink, namespace), id = hash(namespace + "\0row\0" + tableId + "\0" + curveKey), prior = await get(ink, id);
					if (prior) {
						if (prior.namespace === namespace && prior.kind === "ink-table-row" && !prior.archived) return Response.json({
							row: prior,
							existing: true
						});
						throw fail("That key is already used. Restore the original curve.", 409);
					}
					if ((await ink.data.query({
						namespace,
						tag: "ink-table:" + tableId,
						limit: 1e3
					})).objects.filter((o) => o.kind === "ink-table-row").length >= LIMITS.curves) throw fail("Use up to 500 curves.");
					const record = await ink.data.create({
						id,
						kind: ROW_KIND,
						title: valid.name,
						tags: ["ink-tables", "ink-table:" + tableId],
						body: JSON.stringify({
							format: ROW_KIND,
							version: 1,
							tableId,
							key: curveKey,
							values: valid
						})
					});
					return Response.json({ row: record }, { status: 201 });
				}
				if (![
					"/curves/point",
					"/curves/metadata",
					"/curves/archive",
					"/curves/restore"
				].includes(path)) throw fail("Unknown curve action.", 404);
				for (let i = 0; i < 8; i++) {
					const { record, body, values } = await row(ink, namespace, input.id);
					let changes;
					if (path === "/curves/archive" || path === "/curves/restore") {
						if (input.expectedRevision !== record.revision) throw fail("This curve changed. Refresh before removing or restoring it.", 409);
						if (path === "/curves/restore") {
							if ((await ink.data.query({
								namespace,
								tag: "ink-table:" + body.tableId,
								limit: 1e3
							})).objects.filter((o) => o.kind === "ink-table-row").length >= LIMITS.curves) throw fail("Use up to 500 curves.");
						}
						changes = { archived: path.endsWith("/archive") };
					} else {
						if (record.archived) throw fail("This curve was removed.", 409);
						let next;
						if (path === "/curves/point") next = pointChange(values, input.action);
						else {
							const field = input.field;
							if (![
								"name",
								"description",
								"x_label",
								"y_label",
								"interpolation",
								"outside"
							].includes(field)) throw fail("Choose an editable curve field.");
							if (!same(values[field], input.expected)) throw fail("This field changed in another editor. Its newer value was preserved.", 409);
							next = normalize({
								...values,
								[field]: input.value
							});
							if (!next.name.trim()) throw fail("Enter a curve name.");
						}
						changes = {
							body: JSON.stringify({
								...body,
								values: next
							}),
							title: next.name
						};
					}
					try {
						return Response.json({ row: await ink.data.update(record.id, changes, record.revision) });
					} catch (e) {
						if (e.status !== 409 || i === 7) throw e;
					}
				}
			});
		} catch (e) {
			return Response.json({ error: e.message || "Could not save the curve." }, { status: e.status || (e instanceof SyntaxError ? 400 : 500) });
		}
	};
}
var fetch = createService();
export { createService, fetch };
