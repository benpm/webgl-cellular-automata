const path = require("path");

module.exports = {
    entry: "./src/sim.js",
    output: {
        filename: "bundle.js",
        path: path.resolve(__dirname, "dist")
    },
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: ["style-loader", "css-loader"]
            },
            {
                test: /\.glsl$/i,
                use: ["raw-loader"]
            }
        ]
    },
    resolve: {
        fallback: {
            "path": false,
            "os": false
        }
    }
};