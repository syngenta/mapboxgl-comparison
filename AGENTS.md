# AGENTS.md

Guidelines for coding agents working in the mapboxgl-comparison repository.

## Project Overview

A TypeScript library providing a custom comparison layer for Mapbox GL JS. It allows overlaying and comparing two map layers using WebGL shaders.

## Build/Lint/Test Commands

```bash
# Development server
npm run dev

# Build the library
npm run build

# Preview production build
npm run preview

# Type check (no separate command - part of build)
npx tsc --noEmit
```

**Note**: This project has no test suite or lint commands configured. Type checking is integrated into the build process.

## Project Structure

```
├── lib/                    # Library source code
│   ├── main.ts             # Public exports entry point
│   ├── CustomLayer.ts      # Main layer implementation
│   └── shaders/            # WebGL shaders
│       ├── vertexShader.ts
│       └── fragmentShader.ts
├── example/                # Demo application
│   └── main.ts
├── dist/                   # Build output (generated)
├── vite.config.ts          # Vite build configuration
├── tsconfig.json           # TypeScript config for development
└── tsconfig-build.json     # TypeScript config for production build
```

## Code Style Guidelines

### Imports

- Use ES module syntax with `import`/`export`
- Import mapbox-gl as default import: `import mapboxgl from "mapbox-gl"`
- Include file extensions for local TypeScript imports: `import x from "./shaders/vertexShader.ts"`
- Group imports: external dependencies first, then internal modules

### Formatting

- Use double quotes for strings
- 2-space indentation
- No trailing commas in object/type definitions
- Keep lines under 100 characters when practical

### Types

- Use explicit type annotations for function parameters and return types
- Define type aliases at top of file, before interfaces
- Use `interface` for object shapes that can be extended
- Use `type` for unions, tuples, and function signatures
- Mark class members with appropriate visibility: `private`, `protected`, `public`
- Use TypeScript strict mode features (enabled in tsconfig)

```typescript
// Type alias for function signatures
type onAddCallback = (
  _: mapboxgl.Map,
  gl: WebGLRenderingContext,
  data: ComparisonLayerData
) => ComparisonLayerProgram;

// Interface for object shapes
interface ComparisonLayerProgram extends WebGLProgram {
  aPos: number;
  uMatrix: WebGLUniformLocation | null;
}
```

### Naming Conventions

- **Classes**: PascalCase (e.g., `ComparisonLayer`)
- **Functions/Methods**: camelCase (e.g., `setupLayer`, `updateTiles`)
- **Private members**: Prefix with underscore when used as unused parameter (e.g., `_`)
- **Constants**: camelCase for local, SCREAMING_SNAKE_CASE for global constants
- **Type/Interface names**: PascalCase with descriptive suffix (e.g., `ComparisonLayerData`)
- **Shader attributes**: Prefix with `a` (e.g., `aPos`)
- **Shader uniforms**: Prefix with `u` (e.g., `uMatrix`)
- **Shader varyings**: Prefix with `v` (e.g., `vTexCoord`)

### Class Organization

Organize class members in this order:
1. Reference properties (map, gl context)
2. Mapbox-specific members (id, type, sourceId)
3. Custom data properties
4. Callbacks
5. Constructor
6. Lifecycle methods (onAdd, render, prerender)
7. Public methods
8. Private methods

### Error Handling

- Throw `Error` objects with descriptive messages
- Prefix error messages with context in brackets: `[shader]`, `[program]`
- Handle null checks before using WebGL resources

```typescript
const vertexShader = gl.createShader(gl.VERTEX_SHADER);
if (!vertexShader) {
  throw new Error("[shader] failed to create vertex shader");
}
```

### WebGL/Mapbox Specifics

- Use `//@ts-ignore` for Mapbox internal API access (undocumented properties)
- Document hack workarounds with comments: `// !IMPORTANT! hack to...`
- Always check if resources exist before using them
- Trigger repaints with `map?.triggerRepaint()` after data updates

### Exports

- Re-export public API from `lib/main.ts`
- Use named exports for functions and classes
- Use default exports for shader source strings

### TypeScript Configuration

- Target: ES2020
- Module: ESNext with bundler resolution
- Strict mode enabled with additional checks:
  - `noUnusedLocals`
  - `noUnusedParameters`
  - `noFallthroughCasesInSwitch`

## Dependencies

- **mapbox-gl**: Peer dependency (v3.3.0+)
- **vite**: Build tool
- **typescript**: Type checking and compilation

## Important Notes

- The library builds to ES module format only
- WebGL shaders are stored as template literal strings in TypeScript files
- The example directory contains a working demo for testing
- No test framework is currently set up
