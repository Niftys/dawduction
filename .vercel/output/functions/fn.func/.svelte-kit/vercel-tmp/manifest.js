export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["EngineWorkletProcessor.js","vite.config.js"]),
	mimeTypes: {".js":"text/javascript"},
	_: {
		client: {start:"_app/immutable/entry/start.DBnYRL81.js",app:"_app/immutable/entry/app.DeVpSvhB.js",imports:["_app/immutable/entry/start.DBnYRL81.js","_app/immutable/chunks/Bg53_pdl.js","_app/immutable/chunks/C-KikI3b.js","_app/immutable/chunks/BJF9mgOB.js","_app/immutable/entry/app.DeVpSvhB.js","_app/immutable/chunks/C1FmrZbK.js","_app/immutable/chunks/C-KikI3b.js","_app/immutable/chunks/IHki7fMi.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('../output/server/nodes/0.js')),
			__memo(() => import('../output/server/nodes/1.js')),
			__memo(() => import('../output/server/nodes/2.js')),
			__memo(() => import('../output/server/nodes/3.js')),
			__memo(() => import('../output/server/nodes/4.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/project/[id]",
				pattern: /^\/project\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/project/[id]/pattern/[patternId]",
				pattern: /^\/project\/([^/]+?)\/pattern\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false},{"name":"patternId","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
