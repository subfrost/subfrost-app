declare module "raw-loader!*" {
  const contents: Promise<string>;
  export default contents;
}
