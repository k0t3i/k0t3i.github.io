const rootFile = "@/styles/";
const listOfFiles = [
  "_variables.scss",
  "_mixins.scss",
  "_fonts.scss",
  "_reset.scss",
  "_global.scss"
];

module.exports = {
  outputDir: "dist",
  assetsDir: "assets",
  lintOnSave: true,
  publicPath: process.env.NODE_ENV === "production"
    ? "/"
    : "/",
  css: {
    sourceMap: true,
    loaderOptions: {
      sass: {
        prependData: () => {
          let listOfImport = "";
          listOfFiles.forEach(item => {
            listOfImport += `@import "${rootFile}${item}";`;
          });

          return listOfImport;
        }
      }
    }
  },
  chainWebpack: config => {
    config.module
      .rule("fonts")
      .test(/\.(ttf|otf|eot|woff|woff2)$/)
      .use("file-loader")
      .loader("file-loader")
      .tap(options => {
        options = {
          // limit: 10000,
          name: "/assets/fonts/[name].[ext]"
        };
        return options;
      })
      .end();
  }
};
