/** Typed shape of a CSS-Module import, which the bundle inlines as a class map. */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

/** A plain stylesheet import is inlined as one globally injected tag. */
declare module '*.css'
