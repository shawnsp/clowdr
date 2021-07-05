/** @type {import("snowpack").SnowpackUserConfig } */

module.exports = {
    exclude: ["**/LICENSE"],
    mount: {
        public: "/",
        src: "/_dist_",
    },
    packageOptions: {
        polyfillNode: true,
    },
    plugins: [
        "@snowpack/plugin-react-refresh",
        "@snowpack/plugin-dotenv",
        "@snowpack/plugin-typescript",
        ["@snowpack/plugin-webpack", { sourceMap: true }],
    ],
    optimize: {
        target: "es2017",
    },
    devOptions: {
        port: 3000,
    },
    buildOptions: {
        sourcemap: true,
    },
    routes: [{ match: "routes", src: ".*", dest: "/index.html" }],
    workspaceRoot: "../",
};
