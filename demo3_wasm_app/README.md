# WASM Resources - Template-Based Configuration

This directory contains resources for the WASM (WebAssembly) target of the application.

## Template-Based HTML Generation

### Overview
The `index.html` file is **generated** from `index.template.html` during the build process. This approach keeps the source template clean and version-controlled while allowing build-time configuration injection.

### Files
- **`index.template.html`** - Source template (committed to git)
- **`index.html`** - Generated file (ignored by git, created during build)

### How It Works

1. **Template File**: `index.template.html` contains placeholder variables like `${CLERK_PUBLISHABLE_KEY}`
2. **Build Process**: The `generateClerkHtmlFiles` Gradle task reads the template and substitutes variables with values from `local.properties`
3. **Generated File**: `index.html` is created with actual configuration values

### Build Tasks

```bash
# Generate HTML from template (runs automatically during build)
./gradlew :composeApp:generateClerkHtmlFiles

# Clean generated HTML files
./gradlew :composeApp:cleanGeneratedHtml

# Full clean (includes generated files)
./gradlew clean
```

### Configuration Variables

The following variables are substituted during build:

- `${CLERK_PUBLISHABLE_KEY}` - Clerk authentication key
- `${CLERK_SIGN_IN_URL}` - Clerk sign-in URL
- `${CLERK_SIGN_UP_URL}` - Clerk sign-up URL
- `${FIREBASE_API_KEY}` - Firebase API key
- `${FIREBASE_PROJECT_ID}` - Firebase project ID
- `${FIREBASE_WEB_APP_ID}` - Firebase app ID
- `${POSTHOG_API_KEY}` - PostHog analytics key
- `${POSTHOG_HOST}` - PostHog host URL
- `${PIXABAY_API_KEY}` - Pixabay API key
- `${APOLLO_GRAPHQL_ENDPOINT}` - GraphQL endpoint
- `${APOLLO_WEBSOCKET_ENDPOINT}` - GraphQL WebSocket endpoint
- `${MYCLOSET_API_BASE_URL}` - MyCloset API base URL
- `${MYCLOSET_DEV_OVERRIDE_JWT_TOKEN}` - Development JWT token

### Benefits

1. **Version Control**: Template stays clean and can be safely committed
2. **Environment Safety**: No sensitive data in source code
3. **Build Integration**: Automatic generation during WASM builds
4. **Up-to-date Checking**: Gradle only regenerates when template or config changes
5. **Clean Builds**: Generated files are properly cleaned

### Development Workflow

1. **Edit Template**: Modify `index.template.html` for HTML structure changes
2. **Update Config**: Change values in `local.properties` for configuration updates
3. **Build**: Run any WASM build task - HTML is generated automatically
4. **Clean**: Use `./gradlew clean` to remove all generated files

### Important Notes

- **Never edit `index.html` directly** - it will be overwritten
- **Always edit `index.template.html`** for HTML changes
- **The generated `index.html` is in `.gitignore`** and should not be committed
- **Configuration values come from `local.properties`** - ensure it's properly set up