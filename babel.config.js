module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    ['module:react-native-dotenv', {
      moduleName: '@env',
      path: process.env.APP_ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.production' : '.env'),
    }],
  ],
};
