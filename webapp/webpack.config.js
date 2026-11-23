const exec = require('child_process').exec;

const path = require('path');

const PLUGIN_ID = require('../plugin.json').id;

const NPM_TARGET = process.env.npm_lifecycle_event; //eslint-disable-line no-process-env
const isDev = NPM_TARGET === 'debug' || NPM_TARGET === 'debug:watch';

const plugins = [];
if (NPM_TARGET === 'build:watch' || NPM_TARGET === 'debug:watch') {
    plugins.push({
        apply: (compiler) => {
            compiler.hooks.watchRun.tap('WatchStartPlugin', () => {
                // eslint-disable-next-line no-console
                console.log('Change detected. Rebuilding webapp.');
            });
            compiler.hooks.afterEmit.tap('AfterEmitPlugin', () => {
                exec('cd .. && make deploy-from-watch', (err, stdout, stderr) => {
                    if (stdout) {
                        process.stdout.write(stdout);
                    }
                    if (stderr) {
                        process.stderr.write(stderr);
                    }
                });
            });
        },
    });
}

const config = {
    entry: [
        './src/index.tsx',
    ],
    resolve: {
        modules: [
            'src',
            'node_modules',
        ],
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx|ts|tsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        cacheDirectory: true,

                        // Babel configuration is in babel.config.js because jest requires it to be there.
                    },
                },
            },
            {
                // Compass UI and HeroUI ship ES modules that import bare specifiers like 'react/jsx-runtime'.
                test: /\.m?js$/,
                include: /node_modules[\\/](@mattermost[\\/]compass-ui|@heroui)/,
                resolve: {fullySpecified: false},
            },
            {
                // HeroUI's stylesheet: Tailwind compiles it, then postcss.scope.js confines it to
                // .yap-ui so it can't restyle the host. See src/heroui/README.md.
                test: /heroui[\\/]heroui\.css$/,
                use: ['style-loader', {loader: 'css-loader', options: {importLoaders: 1}}, 'postcss-loader'],
            },
            {
                // Yap's logo (assets/yap-icon.svg): `?raw` imports its markup as a string
                // (branding.ts builds the favicons from it); CSS url()s inline it.
                test: /\.svg$/,
                oneOf: [
                    {resourceQuery: /raw/, type: 'asset/source'},
                    {type: 'asset/inline'},
                ],
            },
            {
                test: /\.css$/,
                exclude: /heroui[\\/]heroui\.css$/,
                use: ['style-loader', 'css-loader'],
            },
        ],
    },

    // Libraries the Mattermost web app exposes on window. Using the host's copies keeps
    // React context (store, intl, router) shared with the app and keeps the bundle small.
    externals: [
        {
            react: 'React',
            'react/jsx-runtime': 'ReactJSXRuntime',
            'react/jsx-dev-runtime': 'ReactJSXDevRuntime',
            'react-dom': 'ReactDOM',
            'react-dom/client': 'ReactDOM',
            'react-intl': 'ReactIntl',
            redux: 'Redux',
            'react-redux': 'ReactRedux',
            'react-router-dom': 'ReactRouterDom',
            'prop-types': 'PropTypes',
        },

        // @mattermost/shared components (e.g. WithTooltip) are loaded from the host on demand.
        ({request}, callback) => {
            if ((/^@mattermost\/shared\//).test(request)) {
                return callback(null, `promise globalThis.loadSharedDependency('${request}')`);
            }
            return callback();
        },
    ],
    output: {
        devtoolNamespace: PLUGIN_ID,
        path: path.join(__dirname, '/dist'),
        publicPath: '/',
        filename: 'main.js',
    },
    mode: isDev ? 'development' : 'production',
    devtool: isDev ? 'eval-source-map' : false,
    plugins,
};

module.exports = config;
