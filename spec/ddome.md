DDOME (Declarative DOM Editor) is a visual web application builder powered by DDOM, for producing DDOM-based applications.

As a visual application design tool, it will be modeled on the popular industry patterns found in tools like Google AppSheet, Webflow, Figma, Gutenberg, Plasmic, Bubble, TooJet, Divhunt, PenPot,  etc. Under the hood, it will be quite different, as DDOM defines the unified data, layout, and functionality model. The metadata-driven model keeps the codebase as elegant as possible. The aesthetics will be molded after VSCode dark mode.

Feature and requirements:
- Coded entirely as DDOM Javascript objects, with clear and tight conventions.
	- While DDOME will adopt and define it's own conventions for how to define and maintain attributes of it's applications, it's own codebase and the code it produces will be primarily declarative using DDOM.
	- Uses JSDoc for type annotations.
	- External libraries may be bundled, if they exccelerate development and fit within the rest of the features and requirements.
- Data structure: DDOME works with the following data types:
	- Applications (DDOM `window`): Groups pages, components, and global variables.
		- Variables:
			- Stylebook
				- Variables, visualized with their setting.
				- A user-defined list of HTML elements, visualized with their name in title case as the `textContent`, styled their default styles.
				- A :root "element" will house global variables and styles.
					- Houses user-named CSS global variables of the following types:
						- Colors
						- Font Selections
						- Size
						- Breakpoints
							- Named with a `--breakpoint` convention
							- The text following `--breakpoint` would be used as the name of the breakpoint.
							- The size value of the setting will be the size 
						- Arbitrary input
				- Breakpoints (any number of [@custom-media](https://drafts.csswg.org/mediaqueries-5/#at-ruledef-custom-media) rules)
	- Pages (DDOM `document`):  An application endpoint. Either accessible via URL or used as a dynamic template for rendering data of a specified type.
	- Components (DDOM `CustomElement`): Encapsulation of element structures, attributes, properties, etc.
	- Modules: JS code modules. This is the only non-declarative data type.
	- Requests: A structured definition of data calls:
		- Post Type
		- URL (scheme, host, and/or path)
		- Parameters (key/value pairs)
		- Headers
		- Body
		- Variable (where to store the output)
		- All settings Template-compatible (static or driven by custom properties).
	- Components, modules, and requests can be local (page or component-specific), shared (adoptable by pages and components), or global (included everywhere automatically). Global types are simply included at the application-level by default, whereas shared types must be included voluntarily.	- File structure:
		- package.json <-- application-level metadata and NPM dependencies
		- {application-name}/
			- package.json <-- application metadata (name, version, description, etc.)
			- index.js <-- static utility--exports default export from {application-name}.js
			- {application-name}.js <-- pure DDOM application object
			- components/{component-name}/
				- package.json <-- component metadata
				- index.js <-- static utility--exports default export from {component-name}.js
				- {component-name}.js <-- pure DDOM component object
				- {...nested structure (components, modules, requests)}
			- pages/{page-name}/
				- package.json <-- page metadata
				- index.js <-- static utility--exports default export from {page-name}.js
				- {page-name}.js <-- pure DDOM page object
				- {...nested structure (components, pages, modules, requests)}
			- modules/{module-name}/
				- package.json <-- module metadata
				- index.js <-- static utility--exports default export from {module-name}.js
				- {module-name}.js <-- pure JavaScript module
			- requests/{request-name}/
				- package.json <-- request metadata
				- index.js <-- static utility--exports default export from {request-name}.js
				- {request-name}.js <-- pure request configuration object
- Nesting structuring:
	- The application level is, in-fact, a page (a "SPA" - Ha!). Every (sub)page replicates the structure of the application. A page could, in fact, be promoted to an application by simply opening the page folder in DDOME directly.
	- As such, infinite nesting is supported.
	- The nested structure does not imply URL paths in the final application, but rather inheritance and encapsulation of structure and (stylebook) styles. The URL paths will be configurable as page properties.
- Component-first functionality & modularity: DDOME prefers web-components to encapsulate functionality. Component editor features:
	- Componentization: Any element can be promoted to a component.
	- Local vs Global: Components can be local or global.
	- Style Variants: Components support multiple visual variants using CSS classes.
		- Variants are created and managed through the dedicated Stylebook component.
		- Each variant gets its own class-based styles that override base component styles.
		- The Stylebook visualizes variants with preview elements showing the variant name and styling.
	- Editor Modes: Customize (instance properties) vs Modify (component structure).
- Universal Styling System: DDOME uses a dedicated Stylebook component for visual style management:
	- **Element-Based Visualization**: Select any element (body, component, etc.) to see its style rules.
	- **Global Rules**: When body/root element is selected, shows CSS variables, @font-face, and global styles.
	- **Variant Rules**: Nested CSS classes are visualized as variants with placeholder elements.
	- **Nested Element Rules**: Child element styles are shown with styled preview elements.
	- **Interactive Selection**: Click any rule preview to edit properties in the Settings panel.
	- **Universal Application**: Works with any element, component, or page - not just global stylebooks.
- Scoped: DDOME will itself be a single-page app. Control of the various data-types of an in-editor application will be managed via the ability to navigate between various scopes.
	- Navigation displays a complete tree of the current scope (mirroring the file structure)
		- Page/Application
			- Components (components, shared with child pages)
			- Modules (modules, shared with child pages)
			- Pages
			- Requests (requests, shared with child pages)
			- Styles
				- List of elements and breakpoints in the global stylebook stylesheet
	- Application/page level.
		- Stylebook is inherited by any nested children..
		- Canvas displays the `body`. Any elements added provide the template for children's content (slot required)
	- Sub-page level
		- Any elements added are rendered inside the parent(s) template.
		- A slot is required if sub-pages are added.
- Panel-based UI. The editor UI will use a (VSCode-like) panel-based layout, with a dynamic customizability allowing resizing and re-positioning of panels.
	- Top toolbar
		- Modled after the VSCode titlebar.
		- Has, in order:
			- a button for escaping the current scope (back to parent-level)
			- An input for the title of the currently-scoped object.
			- Undo/Redo buttons
			- Save button.
	- Inserter - A accordion layout with elements that can be added to the current scope. Each element will be self-visualizing. That is, the element itself be rendered in the block inserter pain, with it's own name as the `textContent`, in Title Case.
		- Elements accordion panel: A list of all standard HTML elements. Eventually, only elements that can stand alone as top-level elements (for example `table` but not `td`) will be visible by default.
		- Components accordion panel: A list of all components available in the current scope, further segmented by local (page-specific) and inherited components.
	- Explorer - Displays a tree-based structure of the current application, page, or component. Allows navigation to nested-scopes.
		- Modeled after VSCode explorer sidebar.
		- Displays the structure of the current scope:
			- Default view is application level.
		- By default the structure of the entire application 
		- Allows drag-and-drop reordering and (un)nesting of any objects in the tree.
		- Allows renaming objects.
	- Code editor - VSCode-based code editor with a display of any code relevant to the currently-selected element:
		- Selected modules will display the code of the module.
		- Selected pages and components will display the page/component object code.
		- Selected properties (in the settings tab) will display a code-based view of the property value, allowing for easily refactoring between value types (string, boolean, numbers, and functions)
	- Settings - Provides a tabbed layout with the following:
		- Modeled after VSCode sidebars.
		- Styles: CSS property/attributes.
			- Accordion layout based on rule groupings.
		- Attributes: Standard and custom element attributes their value settings (input-based setting supporting strings, booleans, or numbers)
		- Properties: Standard and custom element properties and their values (set with the code editor)	- Canvas - Visual editing area where DDOM objects are rendered and manipulated:
		- Elements view: The DDOM object in the current scope is rendered for visual editing.
		- Elements can be selected for editing with inline text editing where applicable.
		- Drag and drop reordering and nesting with visual handles.
		- Multiple canvases can be opened for different viewport sizes.
		- Breadcrumb navigation for quickly traversing the element hierarchy.
		- Default empty state accepts slash commands to add elements.
	- Stylebook - Dedicated component for visualizing and managing styles:
		- Shows style rules for the currently selected element.
		- Global rules (CSS variables, @font-face) when body/root is selected.
		- Variant rules (CSS classes) displayed as styled preview elements.
		- Nested element rules shown with element-specific previews.
		- Click any rule preview to edit properties in the Settings panel.
- Metadata-driven: Nowhere in the DDOME code should there ever be explicit references to valid elements, attributes, properties, styles, etc.
	- All of these will be maintained, imported, parsed, and rendered from JSON data sources that list, categorize, and define all potential options, throughout the stack. Ideally we'll align with external sources for these, but the prototype can be driven by a convention-driven home-grown datasets.
	- This means that nowhere in the DDOME JavaScript codebase is there any awareness or insinuation of current HTML/CSS/DOM standards. These are all imported as metadata:
		- HTML elements
		- CSS properties and values
		- Psuedo-classes/element states
		- DOM event listeners
	- For example
		- The inserter will simply render a list of elements from an HTML elements JSON list.
		- The CSS properties panel will render groups and input types based on a JSON nested list of CSS property groups, and value types (defining what native input type should be used to render the value input)
	- This is consistent with the functionality of DDOME pages/applications, since the custom elements will themselves represent "metadata" and be dynamically enabled and configurable in the current scope. All functions should be implemented with as much consistency as possible between the listing and handling of standard (external) elements and custom elements.
- Responsive editing: Canvases will provide a dynamically-resizable viewport for visualizing the application at different widths. If a global breakpoint is defined that matches the current viewport, all style (changes) will be nested with a breakpoint selector. The settings panel will follow the breakpoint (or lack thereof) from the latest-selected canvas.
- Self-composable: The DDOME source code (structure and conventions) should match DDOME's own conventions so that by version 1.0, DDOME will be editable in DDOME! That's right, DDOME is (eventually) a DDOME application.

## Core Architecture

### Foundation Libraries Integration

DDOME is built as a downstream implementation of modular foundation libraries:

- **@declarative-dom/editor**: Provides core editor components (Explorer, Inserter, Canvas, Settings)
- **@declarative-dom/models**: Provides data models and validation (Application, Page, Component, Module, Request)

This modular approach ensures consistency across all DDOM editors while allowing DDOME-specific customizations.

### Application Architecture

```javascript
// DDOME imports and extends foundation components
import { Explorer, Stylebook, Inserter, Canvas, Settings } from '@declarative-dom/editor';
import { ApplicationModel, PageModel, ComponentModel } from '@declarative-dom/models';

// DDOME-specific application shell
const DDOMEApp = {
  tagName: 'ddome-app',
  
  // Application state using foundation models
  currentProject: new ApplicationModel(),
  activeTabs: [],
  selectedElement: null,
  
  // Dynamic tiling system using CSS Grid
  style: {
    display: 'grid',
    gridTemplate: '${this.tileManager.generateGridTemplate()}',
    height: '100vh',
    backgroundColor: 'var(--ddome-bg-primary, #1e1e1e)',
    color: 'var(--ddome-text-primary, #cccccc)',
    fontFamily: 'var(--ddome-font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)'
  },
  
  children: [
    {
      tagName: 'ddome-titlebar',
      style: { gridArea: 'titlebar' }
    },
    {
      // Foundation Explorer component with DDOME customizations
      ...Explorer,
      tagName: 'ddome-explorer',
      style: { ...Explorer.style, gridArea: 'explorer' },
      data: '${this.parentNode.currentProject.get()?.data}',
      onSelectionChange: (path, node) => {
        this.parentNode.selectedElement.set({ path, node });
        this.parentNode.syncAllComponents();
      }
    },
    {
      // Foundation Stylebook component for visualizing element styles
      ...Stylebook,
      tagName: 'ddome-stylebook',
      style: { ...Stylebook.style, gridArea: 'stylebook' },
      target: '${this.parentNode.selectedElement.get()?.node}',
      onRuleSelect: (ruleId, target) => {
        this.parentNode.settings.activeTab.set('styles');
        this.parentNode.settings.activeRule.set(ruleId);
      }
    },
    {
      tagName: 'ddome-tab-bar',
      style: { gridArea: 'tabs' },
      tabs: '${this.parentNode.activeTabs.get()}',
      onTabChange: (tab) => {
        this.parentNode.setActiveTab(tab);
      }
    },
    {
      // Foundation Canvas component with DDOME customizations
      ...Canvas,
      tagName: 'ddome-canvas',
      style: { ...Canvas.style, gridArea: 'canvas' },
      data: '${this.parentNode.getActiveTabContent()}',
      selectedPath: '${this.parentNode.selectedElement.get()?.path}',
      onElementSelect: (path) => {
        this.parentNode.selectedElement.set({ path, node: this.parentNode.getElementAtPath(path) });
        this.parentNode.syncAllComponents();
      }
    },
    {
      // Foundation Settings component with DDOME customizations
      ...Settings,
      tagName: 'ddome-settings',
      style: { ...Settings.style, gridArea: 'settings' },
      target: '${this.parentNode.selectedElement.get()?.node}',
      schema: '${this.parentNode.getElementSchema()}',
      onPropertyChange: (target, key, value) => {
        this.parentNode.updateElement(target, key, value);
      }
    }
  ],
  
  // Tab management methods
  openTab(resource) {
    const tab = {
      id: generateId(),
      name: resource.name,
      type: resource.type, // 'page', 'component', 'module', etc.
      resource: resource,
      modified: false
    };
    
    this.activeTabs.set([...this.activeTabs.get(), tab]);
    this.setActiveTab(tab);
  },
  
  closeTab(tabId) {
    const tabs = this.activeTabs.get().filter(tab => tab.id !== tabId);
    this.activeTabs.set(tabs);
  },
    // Component synchronization
  syncAllComponents() {
    const selected = this.selectedElement.get();
    // Sync all foundation components with current selection
    // Explorer highlights selected path
    // Stylebook shows styles for selected element
    // Canvas focuses on selected element
    // Settings loads properties for selected element
  }
};
```

## Technical Architecture

### Core Components Architecture

DDOME is built using a modular component system where each UI component is a DDOM custom element:

#### Required Base Components:
- **Panel** (`ddome-panel`)
  - Resizable, dockable UI containers
  - Support for drag-and-drop repositioning
  - Collapsible/expandable states
  - Tabbed sub-panels
- **Tabbed Layout** (`ddome-tabs`)
  - Dynamic tab creation/removal
  - Tab reordering via drag-and-drop
  - Keyboard navigation support
- **Accordion Layout** (`ddome-accordion`)
  - Implemented using native `<details>` elements
  - Nested accordion support
  - Expand/collapse animations via CSS
- **Input System** (`ddome-input`)
  - Type-aware input components
  - Native HTML input types only
  - Validation integration
  - Signal-based value binding

### Data Models

#### Application Schema
```javascript
// Pure DDOM Application Object (application-name.js)
{
  // Pure DDOM document structure
  document: {
    head: {
      title: 'My Application',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ]
    },
    body: {
      children: [
        // Application layout structure
      ]
    }
  }
}

// Application Metadata (package.json)
{
  "name": "my-application",
  "version": "1.0.0",
  "description": "My DDOME application",
  "type": "module",
  "main": "index.js",
  "ddome": {
    "type": "application",
    "created": "2024-01-01T00:00:00Z",
    "modified": "2024-01-01T00:00:00Z",
    "author": "Developer Name",
    "tags": ["web-app", "responsive"],
    "components": ["./components/header", "./components/footer"],
    "pages": ["./pages/home", "./pages/about"],
    "modules": ["./modules/utils"],
    "requests": ["./requests/api-client"]
  },
  "dependencies": {
    "ddom": "^1.0.0"
  }
}
```

#### Page Schema
```javascript
// Pure DDOM Page Object (page-name.js)
{
  // Pure DDOM document structure for this page
  document: {
    head: {
      title: 'Page Title',
      meta: [
        { name: 'description', content: 'Page description' }
      ]
    },
    body: {
      children: [
        // Page content structure
      ]
    }
  }
}

// Page Metadata (package.json)
{
  "name": "home-page",
  "version": "1.0.0",
  "description": "Application home page",
  "type": "module",
  "main": "index.js",
  "ddome": {
    "type": "page",
    "route": "/",
    "template": false,
    "created": "2024-01-01T00:00:00Z",
    "modified": "2024-01-01T00:00:00Z",
    "author": "Developer Name",
    "tags": ["landing", "home"],
    "components": ["./components/hero", "./components/features"],
    "modules": ["./modules/analytics"],
    "requests": ["./requests/content-api"]
  },
  "dependencies": {
    "ddom": "^1.0.0"
  }
}
```

#### Component Schema
```javascript
// Pure DDOM Component Object (component-name.js)
{
  tagName: 'my-button',
  
  // Component properties (become reactive signals)
  variant: 'primary',
  disabled: false,
  
  // Component attributes
  type: 'button',
  
  // Component children structure
  children: [
    {
      tagName: 'span',
      textContent: '${this.parentNode.label.get() || "Button"}'
    }
  ],
  
  // Component styles with variants
  style: {
    padding: 'var(--spacing-sm) var(--spacing-md)',
    borderRadius: 'var(--border-radius)',
    border: 'none',
    cursor: 'pointer',
    
    // Variant styles as nested classes
    '&.primary': {
      backgroundColor: 'var(--color-primary)',
      color: 'white'
    },
    '&.secondary': {
      backgroundColor: 'var(--color-secondary)',
      color: 'white'
    },
    '&:disabled': {
      opacity: 0.5,
      cursor: 'not-allowed'
    }
  }
}

// Component Metadata (package.json)
{
  "name": "my-button",
  "version": "1.2.0",
  "description": "Reusable button component with variants",
  "type": "module",
  "main": "index.js",
  "ddome": {
    "type": "component",
    "scope": "local",
    "created": "2024-01-01T00:00:00Z",
    "modified": "2024-01-01T00:00:00Z",
    "author": "Developer Name",
    "tags": ["button", "interactive", "form"],
    "variants": ["primary", "secondary", "outline"],
    "properties": [
      {
        "name": "label",
        "type": "string",
        "default": "Button",
        "description": "Button text content"
      },
      {
        "name": "variant",
        "type": "string",
        "default": "primary",
        "options": ["primary", "secondary", "outline"],
        "description": "Button visual variant"
      },
      {
        "name": "disabled",
        "type": "boolean",
        "default": false,
        "description": "Whether button is disabled"
      }
    ]
  },
  "dependencies": {
    "ddom": "^1.0.0"
  }
}
```

#### Module Schema
```javascript
// Pure JavaScript Module (module-name.js)
export default {
  // Utility functions
  formatDate(date) {
    return new Intl.DateTimeFormat('en-US').format(date);
  },
  
  // Constants
  API_BASE_URL: 'https://api.example.com',
  
  // Complex utilities
  async fetchData(endpoint) {
    const response = await fetch(`${this.API_BASE_URL}/${endpoint}`);
    return response.json();
  }
};

// Module Metadata (package.json)
{
  "name": "utils-module",
  "version": "1.0.0",
  "description": "Utility functions for date formatting and API calls",
  "type": "module",
  "main": "index.js",
  "ddome": {
    "type": "module",
    "scope": "global",
    "created": "2024-01-01T00:00:00Z",
    "modified": "2024-01-01T00:00:00Z",
    "author": "Developer Name",
    "tags": ["utilities", "api", "formatting"],
    "exports": [
      {
        "name": "formatDate",
        "type": "function",
        "description": "Formats date using Intl.DateTimeFormat"
      },
      {
        "name": "fetchData",
        "type": "function",
        "async": true,
        "description": "Fetches data from API endpoint"
      },
      {
        "name": "API_BASE_URL",
        "type": "string",
        "description": "Base URL for API requests"
      }
    ]
  },
  "dependencies": {}
}
```

#### Request Schema
```javascript
// Pure Request Configuration Object (request-name.js)
{
  method: 'GET',
  url: 'https://api.example.com/users/${this.userId.get()}',
  headers: {
    'Authorization': 'Bearer ${window.authToken.get()}',
    'Content-Type': 'application/json'
  },
  parameters: {
    page: '1',
    limit: '10'
  },
  body: null,
  variable: 'userData',
  transform: (response) => response.data,
  cache: true
}

// Request Metadata (package.json)
{
  "name": "user-data-request",
  "version": "1.0.0",
  "description": "Fetches user data from API",
  "type": "module", 
  "main": "index.js",
  "ddome": {
    "type": "request",
    "scope": "global",
    "created": "2024-01-01T00:00:00Z",
    "modified": "2024-01-01T00:00:00Z",
    "author": "Developer Name",
    "tags": ["api", "user", "data"],
    "method": "GET",
    "endpoint": "/users/{userId}",
    "requires": ["userId", "authToken"],
    "returns": "userData",
    "cacheable": true,
    "parameters": [
      {
        "name": "userId",
        "type": "string",
        "required": true,
        "description": "User ID to fetch data for"
      }
    ]
  },
  "dependencies": {}
}
```

### Package-Based File System

#### NPM Package Structure
Every DDOME data type (application, page, component, module, request) is structured as a valid NPM package with:

- **`package.json`**: Contains all metadata, dependencies, and DDOME-specific configuration
- **`index.js`**: Standard NPM entry point that exports the main object
- **`{name}.js`**: The pure DDOM/JavaScript object with no metadata artifacts

#### Metadata Organization
```javascript
// Standard package.json structure with DDOME extensions
{
  // Standard NPM fields
  "name": "component-name",
  "version": "1.0.0", 
  "description": "Component description",
  "type": "module",
  "main": "index.js",
  "author": "Developer Name",
  "license": "MIT",
  
  // DDOME-specific metadata
  "ddome": {
    "type": "component|page|application|module|request",
    "scope": "local|global",
    "created": "2024-01-01T00:00:00Z",
    "modified": "2024-01-01T00:00:00Z",
    "tags": ["tag1", "tag2"],
    
    // Type-specific fields
    "variants": ["primary", "secondary"],      // Components only
    "route": "/path",                          // Pages only
    "method": "GET",                           // Requests only
    "exports": [...]                           // Modules only
  },
  
  // Dependencies
  "dependencies": {
    "ddom": "^1.0.0"
  }
}
```

#### Pure Object Files
The actual DDOM objects contain no metadata - only the pure functional definition:

```javascript
// component.js - Pure DDOM component object
export default {
  tagName: 'my-component',
  property: 'value',
  children: [...]
};

// page.js - Pure DDOM page object  
export default {
  document: {
    body: {
      children: [...]
    }
  }
};

// module.js - Pure JavaScript module
export default {
  function1() { /* ... */ },
  constant: 'value'
};
```

#### Directory Structure
```
{application-name}/
├── package.json                     # Application metadata and dependencies
├── index.js                        # Application entry point
├── {application-name}.js           # Pure DDOM application object
├── components/
│   └── {component-name}/
│       ├── package.json            # Component metadata
│       ├── index.js               # Component entry point
│       ├── {component-name}.js    # Pure DDOM component object
│       ├── components/            # Nested components
│       ├── modules/               # Component-specific modules
│       └── requests/              # Component-specific requests
├── pages/
│   └── {page-name}/
│       ├── package.json          # Page metadata
│       ├── index.js             # Page entry point
│       ├── {page-name}.js       # Pure DDOM page object
│       ├── components/          # Page-specific components
│       ├── modules/             # Page-specific modules
│       ├── requests/            # Page-specific requests
│       └── pages/               # Sub-pages
├── modules/
│   └── {module-name}/
│       ├── package.json         # Module metadata
│       ├── index.js            # Module entry point
│       └── {module-name}.js    # Pure JavaScript module
└── requests/
    └── {request-name}/
        ├── package.json        # Request metadata
        ├── index.js           # Request entry point
        └── {request-name}.js  # Pure request configuration
```

#### Naming Conventions
- **Files**: kebab-case (e.g., `user-profile.js`)
- **Components**: kebab-case tag names, Title Case display names
- **Variables**: camelCase
- **CSS Variables**: `--kebab-case` with semantic prefixes
- **Breakpoints**: `--breakpoint-{name}` (e.g., `--breakpoint-mobile`)

### Stylebook System

#### Global Variable Types
```javascript
{
  ':root': {
    // Color system
    '--color-primary': '#007bff',
    '--color-secondary': '#6c757d',
    '--color-success': '#28a745',
    
    // Typography
    '--font-family-primary': 'system-ui, sans-serif',
    '--font-size-base': '16px',
    '--line-height-base': '1.5',
    
    // Spacing
    '--spacing-xs': '0.25rem',
    '--spacing-sm': '0.5rem',
    '--spacing-md': '1rem',
    
    // Breakpoints
    '--breakpoint-mobile': '768px',
    '--breakpoint-tablet': '1024px',
    '--breakpoint-desktop': '1440px'
  }
}
```

#### Element Default Styles
Elements in the stylebook are defined with their default appearance:
```javascript
{
  'button': {
    backgroundColor: 'var(--color-primary)',
    color: 'white',
    border: 'none',
    borderRadius: '0.25rem',
    padding: 'var(--spacing-sm) var(--spacing-md)'
  },
  'input': {
    border: '1px solid var(--color-secondary)',
    borderRadius: '0.25rem',
    padding: 'var(--spacing-sm)'
  }
}
```

### Metadata Integration

#### HTML Elements Metadata
```javascript
{
  "elements": [
    {
      "tagName": "div",
      "category": "container",
      "description": "Generic container element",
      "attributes": ["id", "class", "style", "data-*"],
      "allowedChildren": "any",
      "selfClosing": false
    },
	{
	  "tagName": "button",
	  "category": "interactive",
	  "description": "Clickable button element",
	  "attributes": ["type", "disabled", "onclick"],
	  "allowedChildren": ["span", "icon"],
	  "selfClosing": false
	},
	{
	  "tagName": "img",
	  "category": "media",
	  "description": "Image element",
	  "attributes": ["src", "alt", "width", "height"],
	  "allowedChildren": [],
	  "selfClosing": true
	},
	// ...
  ]
}
```

#### CSS Properties Metadata
```javascript
{
  "properties": [
    {
      "name": "backgroundColor",
      "group": "background",
      "type": "color",
      "inputType": "color",
      "inherited": false,
      "description": "Sets the background color"
    },
	{
	  "name": "fontSize",
	  "group": "typography",
	  "type": "length",
	  "inputType": "text",
	  "inherited": true,
	  "description": "Sets the font size"
	},
	{
	  "name": "display",
	  "group": "layout",
	  "type": "enum",
	  "values": ["block", "inline", "flex", "grid"],
	  "inputType": "select",
	  "inherited": false,
	  "description": "Sets the display type of an element"
	}
	// ...
  ]
}
```

#### DOM Events Metadata
```javascript
{
  "events": [
    {
      "name": "onclick",
      "category": "mouse",
      "description": "Fired when element is clicked",
      "parameters": ["MouseEvent"]
    },
	{
	  "name": "onchange",
	  "category": "form",
	  "description": "Fired when input value changes",
	  "parameters": ["Event"]
	},
	{
	  "name": "onmouseover",
	  "category": "mouse",
	  "description": "Fired when mouse enters element",
	  "parameters": ["MouseEvent"]
	}
	// ...
  ]
}
```

### Component System

#### Component Lifecycle
1. **Definition**: Component structure and defaults
2. **Registration**: Added to scope-specific component registry
3. **Instantiation**: Created with specific attributes/properties
4. **Rendering**: DDOM element creation and DOM insertion
5. **Reactivity**: Signal-based property updates
6. **Cleanup**: Automatic garbage collection

#### Variant System
```javascript
{
  tagName: 'my-button',
  style: {
      backgroundColor: 'var(--color-primary)',
      color: 'white',
      '.secondary': { // 'Secondary' Variant
        backgroundColor: 'var(--color-secondary)',
        color: 'white'
      },
      '.outline': { // 'Outline' Variant
        backgroundColor: 'transparent',
        border: '1px solid var(--color-primary)',
        color: 'var(--color-primary)'
      }
  }
}
```

### Responsive Design System

#### Breakpoint Management
- Canvas viewports automatically detect matching breakpoints
- Style changes are wrapped in appropriate media queries
- Breakpoint inheritance follows CSS cascade rules

#### Style Nesting for Breakpoints
```javascript
{
  style: {
    fontSize: '16px',
    '@media (max-width: var(--breakpoint-mobile))': {
      fontSize: '14px'
    }
  }
}
```

### Editor State Management

#### Scope Navigation
```javascript
{
  currentScope: {
    type: 'application'|'page'|'component',
    path: String,        // File system path
    object: Object       // Current DDOM object
  },
  navigation: {
    history: Array,      // Breadcrumb navigation
    canGoBack: Boolean,
    canGoForward: Boolean
  },
  selection: {
    element: Object,     // Currently selected element
    property: String     // Currently selected property
  }
}
```

#### Panel State Management
```javascript
{
  panels: {
    inserter: { visible: true, width: 250 },
    explorer: { visible: true, width: 300 },
    canvas: { visible: true, tabs: ['elements', 'stylebook'] },
    settings: { visible: true, width: 350, activeTab: 'styles' },
    code: { visible: false, height: 200 }
  },
  layout: 'default'|'compact'|'custom'
}
```

## Coding Conventions

### Priority-Based Pattern Selection
1. **Cutting-edge ES2023+**: Polyfilled modern features
   - `core-js` for ECMAScript 2024 features
   - TC39 proposals via polyfills
2. **Modern CSS over JavaScript**:
   - Native `<details>` for accordions
   - Popover API for modals/tooltips
   - CSS Anchor positioning
   - CSS `@property` for custom properties
3. **Modern JavaScript Patterns**:
   - mapped functions (a.k.a. object lookup) over `switch` statements
   - `switch` over chained `if/else`
   - Destructuring and spread operators
   - Optional chaining and nullish coalescing

### Code Style Requirements
- **Zero legacy support**: No IE, no polyfills for pre-ES6
- **Elegant conciseness**: Favor readable brevity
- **DDOM-first**: All UI components as DDOM objects
- **JSDoc typing**: Complete type annotations
- **Signal-based reactivity**: Explicit `.get()`/`.set()` patterns

### External Dependencies
- **Core-js**: Modern ECMAScript features
- **DDOM library**: Base reactivity and component system
- **Metadata sources**: HTML/CSS/DOM specifications as JSON

## UI Component Specifications

### Panel System (`ddome-panel`)
```javascript
/**
 * @typedef {Object} DDOMEPanel
 * @property {string} tagName - 'ddome-panel'
 * @property {string} panelId - Unique panel identifier
 * @property {boolean} resizable - Whether panel can be resized
 * @property {boolean} dockable - Whether panel can be docked
 * @property {string} position - 'left'|'right'|'top'|'bottom'|'floating'
 * @property {number} width - Panel width in pixels
 * @property {number} height - Panel height in pixels
 * @property {boolean} collapsed - Panel collapse state
 * @property {Array} tabs - Tab definitions for tabbed panels
 */
{
  tagName: 'ddome-panel',
  panelId: 'inserter',
  resizable: true,
  dockable: true,
  position: 'left',
  width: 250,
  collapsed: false,
  style: {
    backgroundColor: 'var(--panel-bg)',
    borderRight: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column'
  },
  children: [/* panel content */]
}
```

### Toolbar System (`ddome-toolbar`)
```javascript
/**
 * @typedef {Object} DDOMEToolbar
 * @property {string} tagName - 'ddome-toolbar'
 * @property {string} position - 'top'|'bottom'
 * @property {Array} actions - Toolbar action buttons
 */
{
  tagName: 'ddome-toolbar',
  position: 'top',
  style: {
    height: '40px',
    backgroundColor: 'var(--toolbar-bg)',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 var(--spacing-sm)'
  },
  children: [
    {
      tagName: 'button',
      className: 'back-button',
      textContent: '←',
      onclick: 'this.getRootNode().host.navigateBack()',
      disabled: '${!this.getRootNode().host.canGoBack.get()}'
    },
    {
      tagName: 'input',
      type: 'text',
      placeholder: 'Application Name',
      value: '${this.getRootNode().host.currentScope.get().name}'
    },
    {
      tagName: 'button',
      textContent: 'Save',
      onclick: 'this.getRootNode().host.save()'
    }
  ]
}
```

### Canvas System (`ddome-canvas`)
```javascript
/**
 * @typedef {Object} DDOMECanvas
 * @property {string} tagName - 'ddome-canvas'
 * @property {string} mode - 'elements'|'stylebook'
 * @property {number} viewport - Current viewport width
 * @property {string} breakpoint - Active breakpoint name
 * @property {Object} selectedElement - Currently selected element
 */
{
  tagName: 'ddome-canvas',
  mode: 'elements',
  viewport: 1200,
  selectedElement: null,
  style: {
    backgroundColor: 'var(--canvas-bg)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    overflow: 'auto',
    position: 'relative'
  },
  children: [
    {
      tagName: 'div',
      className: 'canvas-viewport',
      style: {
        width: '${this.parentNode.viewport.get()}px',
        minHeight: '100%',
        margin: '0 auto',
        backgroundColor: 'white',
        boxShadow: '0 0 20px rgba(0,0,0,0.1)'
      },
      children: [
        // Rendered application content
      ]
    }
  ]
}
```

### Explorer Tree (`ddome-explorer`)
```javascript
/**
 * @typedef {Object} DDOMEExplorer
 * @property {string} tagName - 'ddome-explorer'
 * @property {Object} currentScope - Current application/page/component
 * @property {Array} expandedItems - List of expanded tree items
 */
{
  tagName: 'ddome-explorer',
  currentScope: 'window.ddome.currentScope',
  expandedItems: [],
  children: [
    {
      tagName: 'div',
      className: 'explorer-header',
      textContent: 'Explorer'
    },
    {
      tagName: 'ddome-tree',
      items: '${this.parentNode.currentScope.get().structure}',
      map: {
        tagName: 'ddome-tree-item',
        item: (item) => item,
        expanded: (item) => item.expanded || false,
        children: [
          {
            tagName: 'div',
            className: 'tree-item-content',
            textContent: '${this.parentNode.item.get().name}',
            onclick: () => this.getRootNode().host.selectItem(this.parentNode.item.get())
          }
        ]
      }
    }
  ]
}
```

## Rendering Engine Specifications

### DDOM Integration Layer
```javascript
/**
 * @class DDOMERenderer
 * @description Renders DDOME applications using DDOM
 */
class DDOMERenderer {
  /**
   * @param {Object} application - DDOME application definition
   * @param {HTMLElement} container - Target DOM container
   */
  constructor(application, container) {
    this.application = application;
    this.container = container;
    this.ddom = null;
  }

  /**
   * Renders the application
   * @returns {Object} DDOM instance
   */
  render() {
    this.ddom = DDOM({
      ...this.application,
      document: {
        ...this.application.document,
        body: this.processBody(this.application.document.body)
      }
    });
    
    return this.ddom;
  }

  /**
   * Processes body content with DDOME-specific features
   * @param {Object} body - Body definition
   * @returns {Object} Processed body
   */
  processBody(body) {
    return {
      ...body,
      children: this.processChildren(body.children || [])
    };
  }

  /**
   * Recursively processes child elements
   * @param {Array} children - Child element definitions
   * @returns {Array} Processed children
   */
  processChildren(children) {
    return children.map(child => this.processElement(child));
  }

  /**
   * Processes individual element with DDOME features
   * @param {Object} element - Element definition
   * @returns {Object} Processed element
   */
  processElement(element) {
    // Add selection handling
    const processedElement = {
      ...element,
      onclick: (event) => {
        if (element.onclick) {
          element.onclick.call(this, event);
        }
        this.selectElement(element);
        event.stopPropagation();
      }
    };

    // Process children recursively
    if (element.children) {
      processedElement.children = this.processChildren(element.children);
    }

    return processedElement;
  }

  /**
   * Handles element selection in editor
   * @param {Object} element - Selected element
   */
  selectElement(element) {
    // Emit selection event
    this.container.dispatchEvent(new CustomEvent('element-selected', {
      detail: { element }
    }));
  }
}
```

### Template Processing Engine

```javascript
/**
 * @class TemplateProcessor
 * @description Processes DDOME template strings and expressions
 */
class TemplateProcessor {
  /**
   * Processes template literals in object properties
   * @param {Object} obj - Object to process
   * @param {Object} context - Template context
   * @returns {Object} Processed object
   */
  static processTemplates(obj, context = {}) {
    if (typeof obj === 'string' && obj.includes('${')) {
      return this.processTemplateString(obj, context);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.processTemplates(item, context));
    }
    
    if (obj && typeof obj === 'object') {
      const processed = {};
      for (const [key, value] of Object.entries(obj)) {
        processed[key] = this.processTemplates(value, context);
      }
      return processed;
    }
    
    return obj;
  }

  /**
   * Processes individual template string
   * @param {string} template - Template string
   * @param {Object} context - Template context
   * @returns {Function} Template function
   */
  static processTemplateString(template, context) {
    return () => {
      try {
        return new Function('context', `
          with (context) {
            return \`${template}\`;
          }
        `)(context);
      } catch (error) {
        console.warn('Template processing error:', error);
        return template;
      }
    };
  }
}
```

## Data Management Specifications

### State Management System
```javascript
/**
 * @class DDOMEState
 * @description Manages application state using DDOM signals
 */
class DDOMEState {
  constructor() {
    this.signals = new Map();
    this.computedSignals = new Map();
    this.effects = new Set();
  }

  /**
   * Creates or retrieves a signal
   * @param {string} key - Signal key
   * @param {*} initialValue - Initial value
   * @returns {Signal} DDOM signal
   */
  signal(key, initialValue) {
    if (!this.signals.has(key)) {
      this.signals.set(key, new Signal.State(initialValue));
    }
    return this.signals.get(key);
  }

  /**
   * Creates a computed signal
   * @param {string} key - Computed signal key
   * @param {Function} computation - Computation function
   * @returns {Signal} Computed signal
   */
  computed(key, computation) {
    if (!this.computedSignals.has(key)) {
      this.computedSignals.set(key, new Signal.Computed(computation));
    }
    return this.computedSignals.get(key);
  }

  /**
   * Creates an effect
   * @param {Function} effectFn - Effect function
   * @returns {Function} Cleanup function
   */
  effect(effectFn) {
    const effect = new Signal.subtle.Watcher(effectFn);
    this.effects.add(effect);
    effect.watch();
    
    return () => {
      effect.unwatch();
      this.effects.delete(effect);
    };
  }
}
```

### File System Integration
```javascript
/**
 * @class DDOMEFileSystem
 * @description Manages DDOME project file system operations with NPM package structure
 */
class DDOMEFileSystem {
  constructor(basePath) {
    this.basePath = basePath;
    this.packageCache = new Map();
    this.objectCache = new Map();
  }

  /**
   * Loads a DDOME package (application, component, page, module, or request)
   * @param {string} packagePath - Path to package directory
   * @returns {Promise<Object>} Package object with metadata and content
   */
  async loadPackage(packagePath) {
    const cacheKey = this.resolvePath(packagePath);
    
    if (this.packageCache.has(cacheKey)) {
      return this.packageCache.get(cacheKey);
    }

    // Load package.json metadata
    const packageJson = await this.loadFile(`${packagePath}/package.json`);
    const metadata = JSON.parse(packageJson);
    
    // Load the main object file
    const mainFile = metadata.main || 'index.js';
    const objectModule = await import(`${this.resolvePath(packagePath)}/${mainFile}`);
    const objectContent = objectModule.default;
    
    const package = {
      metadata,
      content: objectContent,
      path: packagePath,
      type: metadata.ddome?.type || 'unknown'
    };
    
    this.packageCache.set(cacheKey, package);
    return package;
  }

  /**
   * Saves a DDOME package with metadata and content separation
   * @param {string} packagePath - Path to package directory
   * @param {Object} packageData - Package data with metadata and content
   */
  async savePackage(packagePath, packageData) {
    const { metadata, content, type } = packageData;
    
    // Ensure directory exists
    await this.ensureDirectory(packagePath);
    
    // Save package.json with all metadata
    await this.saveFile(
      `${packagePath}/package.json`,
      JSON.stringify(metadata, null, 2)
    );
    
    // Save index.js entry point
    const entryPoint = this.generateEntryPoint(metadata.name, type);
    await this.saveFile(`${packagePath}/index.js`, entryPoint);
    
    // Save the pure object file
    const objectFileName = `${metadata.name}.js`;
    const objectContent = this.serializeObject(content, type);
    await this.saveFile(`${packagePath}/${objectFileName}`, objectContent);
    
    // Clear caches
    this.packageCache.delete(this.resolvePath(packagePath));
    this.objectCache.delete(this.resolvePath(packagePath));
  }

  /**
   * Loads application with all nested packages
   * @param {string} appName - Application name
   * @returns {Promise<Object>} Complete application structure
   */
  async loadApplication(appName) {
    const appPath = this.resolvePath(appName);
    const appPackage = await this.loadPackage(appPath);
    
    // Load nested packages based on metadata
    const components = await this.loadNestedPackages(appPath, 'components');
    const pages = await this.loadNestedPackages(appPath, 'pages');
    const modules = await this.loadNestedPackages(appPath, 'modules');
    const requests = await this.loadNestedPackages(appPath, 'requests');
    
    return {
      ...appPackage,
      components,
      pages,
      modules,
      requests
    };
  }

  /**
   * Loads nested packages from a directory
   * @param {string} basePath - Base path
   * @param {string} type - Package type directory
   * @returns {Promise<Map>} Map of nested packages
   */
  async loadNestedPackages(basePath, type) {
    const packages = new Map();
    const typeDir = `${basePath}/${type}`;
    
    try {
      const entries = await this.listDirectory(typeDir);
      
      for (const entry of entries) {
        if (await this.isDirectory(`${typeDir}/${entry}`)) {
          const package = await this.loadPackage(`${typeDir}/${entry}`);
          packages.set(entry, package);
        }
      }
    } catch (error) {
      // Directory doesn't exist - return empty map
    }
    
    return packages;
  }

  /**
   * Generates standard NPM entry point
   * @param {string} name - Package name
   * @param {string} type - Package type
   * @returns {string} Generated entry point code
   */
  generateEntryPoint(name, type) {
    return `// Generated entry point for ${type}: ${name}
// This file exports the pure DDOM object
import ddomeObject from './${name}.js';

export default ddomeObject;
`;
  }

  /**
   * Serializes object to JavaScript with appropriate formatting
   * @param {Object} obj - Object to serialize
   * @param {string} type - Object type
   * @returns {string} Serialized JavaScript code
   */
  serializeObject(obj, type) {
    const typeComment = {
      application: 'Pure DDOM Application Object',
      page: 'Pure DDOM Page Object', 
      component: 'Pure DDOM Component Object',
      module: 'Pure JavaScript Module',
      request: 'Pure Request Configuration Object'
    };

    return `// ${typeComment[type] || 'DDOME Object'}
// Generated by DDOME - contains no metadata artifacts

export default ${JSON.stringify(obj, null, 2)};
`;
  }

  /**
   * Creates a new DDOME package structure
   * @param {string} packagePath - Path for new package
   * @param {string} type - Package type
   * @param {Object} options - Package creation options
   */
  async createPackage(packagePath, type, options = {}) {
    const packageName = options.name || this.getPackageNameFromPath(packagePath);
    
    // Generate metadata
    const metadata = this.generatePackageMetadata(packageName, type, options);
    
    // Generate default content based on type
    const content = this.generateDefaultContent(type, options);
    
    // Save the package
    await this.savePackage(packagePath, {
      metadata,
      content,
      type
    });
  }

  /**
   * Generates package metadata
   * @param {string} name - Package name
   * @param {string} type - Package type
   * @param {Object} options - Additional options
   * @returns {Object} Package metadata
   */
  generatePackageMetadata(name, type, options) {
    const now = new Date().toISOString();
    
    return {
      name,
      version: '1.0.0',
      description: options.description || `DDOME ${type}`,
      type: 'module',
      main: 'index.js',
      author: options.author || '',
      license: 'MIT',
      ddome: {
        type,
        scope: options.scope || 'local',
        created: now,
        modified: now,
        tags: options.tags || [],
        ...this.getTypeSpecificMetadata(type, options)
      },
      dependencies: {
        ddom: '^1.0.0'
      }
    };
  }

  /**
   * Generates type-specific metadata fields
   * @param {string} type - Package type
   * @param {Object} options - Options
   * @returns {Object} Type-specific metadata
   */
  getTypeSpecificMetadata(type, options) {
    switch (type) {
      case 'component':
        return {
          variants: options.variants || [],
          properties: options.properties || []
        };
      case 'page':
        return {
          route: options.route || '/',
          template: options.template || false
        };
      case 'request':  
        return {
          method: options.method || 'GET',
          endpoint: options.endpoint || '',
          cacheable: options.cacheable || false
        };
      case 'module':
        return {
          exports: options.exports || []
        };
      default:
        return {};
    }
  }

  /**
   * Generates default content for package type
   * @param {string} type - Package type
   * @param {Object} options - Options
   * @returns {Object} Default content
   */
  generateDefaultContent(type, options) {
    switch (type) {
      case 'application':
        return {
          stylebook: {
            ':root': {
              '--color-primary': '#007bff'
            }
          },
          document: {
            head: {
              title: options.name || 'DDOME Application'
            },
            body: {
              children: []
            }
          }
        };
        
      case 'page':
        return {
          document: {
            head: {
              title: options.name || 'Page'
            },
            body: {
              children: []
            }
          }
        };
        
      case 'component':
        return {
          tagName: options.tagName || 'my-component',
          children: []
        };
        
      case 'module':
        return {
          // Empty module
        };
        
      case 'request':
        return {
          method: options.method || 'GET',
          url: options.url || '',
          headers: {},
          parameters: {},
          variable: options.variable || 'data'
        };
        
      default:
        return {};
    }
  }
}
```

## Event System Specifications

### Editor Event Bus
```javascript
/**
 * @class DDOMEEventBus
 * @description Central event coordination for DDOME editor
 */
class DDOMEEventBus extends EventTarget {
  constructor() {
    super();
    this.subscribers = new Map();
  }

  /**
   * Emits an event
   * @param {string} eventName - Event name
   * @param {*} data - Event data
   */
  emit(eventName, data) {
    this.dispatchEvent(new CustomEvent(eventName, { detail: data }));
  }

  /**
   * Subscribes to an event
   * @param {string} eventName - Event name
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(eventName, handler) {
    this.addEventListener(eventName, handler);
    
    return () => {
      this.removeEventListener(eventName, handler);
    };
  }

  /**
   * Subscribes to an event once
   * @param {string} eventName - Event name
   * @param {Function} handler - Event handler
   */
  once(eventName, handler) {
    this.addEventListener(eventName, handler, { once: true });
  }
}

// Global event bus instance
window.ddomeEvents = new DDOMEEventBus();

// Standard DDOME events
const DDOME_EVENTS = {
  ELEMENT_SELECTED: 'element-selected',
  ELEMENT_MODIFIED: 'element-modified',
  COMPONENT_CREATED: 'component-created',
  SCOPE_CHANGED: 'scope-changed',
  APPLICATION_SAVED: 'application-saved',
  CANVAS_RESIZED: 'canvas-resized',
  BREAKPOINT_CHANGED: 'breakpoint-changed'
};
```

## Validation and Testing Specifications

### Schema Validation
```javascript
/**
 * @class DDOMEValidator
 * @description Validates DDOME objects against schemas
 */
class DDOMEValidator {
  /**
   * Validates application structure
   * @param {Object} application - Application to validate
   * @returns {Object} Validation result
   */
  static validateApplication(application) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!application.name) {
      errors.push('Application name is required');
    }

    // Name format
    if (application.name && !/^[a-z][a-z0-9-]*[a-z0-9]$/.test(application.name)) {
      errors.push('Application name must be kebab-case');
    }

    // Validate components
    if (application.components) {
      for (const [name, component] of Object.entries(application.components)) {
        const componentValidation = this.validateComponent(component);
        errors.push(...componentValidation.errors);
        warnings.push(...componentValidation.warnings);
      }
    }

    return { errors, warnings, valid: errors.length === 0 };
  }

  /**
   * Validates component structure
   * @param {Object} component - Component to validate
   * @returns {Object} Validation result
   */
  static validateComponent(component) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!component.tagName) {
      errors.push('Component tagName is required');
    }

    // TagName format
    if (component.tagName && !/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(component.tagName)) {
      errors.push('Component tagName must be kebab-case with at least one hyphen');
    }

    return { errors, warnings, valid: errors.length === 0 };
  }

  /**
   * Validates DDOM element structure
   * @param {Object} element - Element to validate
   * @returns {Object} Validation result
   */
  static validateElement(element) {
    const errors = [];
    const warnings = [];

    if (!element.tagName) {
      errors.push('Element tagName is required');
    }

    // Validate children
    if (element.children && Array.isArray(element.children)) {
      for (const child of element.children) {
        const childValidation = this.validateElement(child);
        errors.push(...childValidation.errors);
        warnings.push(...childValidation.warnings);
      }
    }

    return { errors, warnings, valid: errors.length === 0 };
  }
}
```

## Performance Specifications

### Optimization Strategies
```javascript
/**
 * @class DDOMEPerformance
 * @description Performance optimization utilities
 */
class DDOMEPerformance {
  /**
   * Debounces function calls
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} Debounced function
   */
  static debounce(func, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  /**
   * Throttles function calls
   * @param {Function} func - Function to throttle
   * @param {number} limit - Limit in milliseconds
   * @returns {Function} Throttled function
   */
  static throttle(func, limit) {
    let inThrottle;
    return (...args) => {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Measures performance of operations
   * @param {string} name - Operation name
   * @param {Function} operation - Operation to measure
   * @returns {*} Operation result
   */
  static async measure(name, operation) {
    const start = performance.now();
    const result = await operation();
    const end = performance.now();
    
    console.log(`${name}: ${end - start}ms`);
    
    return result;
  }
}

// Performance monitoring
const performanceObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.entryType === 'measure') {
      console.log(`Performance: ${entry.name} took ${entry.duration}ms`);
    }
  }
});

performanceObserver.observe({ entryTypes: ['measure'] });
```

## Implementation Patterns

### Command Pattern for Editor Actions
```javascript
/**
 * @class DDOMECommand
 * @description Base class for editor commands with undo/redo support
 */
class DDOMECommand {
  /**
   * @param {string} name - Command name
   * @param {Object} context - Command context
   */
  constructor(name, context) {
    this.name = name;
    this.context = context;
    this.timestamp = Date.now();
  }

  /**
   * Executes the command
   * @abstract
   */
  execute() {
    throw new Error('Command must implement execute method');
  }

  /**
   * Undoes the command
   * @abstract
   */
  undo() {
    throw new Error('Command must implement undo method');
  }

  /**
   * Checks if command can be merged with another
   * @param {DDOMECommand} other - Other command
   * @returns {boolean} Whether commands can be merged
   */
  canMerge(other) {
    return false;
  }
}

/**
 * @class ElementModifyCommand
 * @description Command for modifying element properties
 */
class ElementModifyCommand extends DDOMECommand {
  constructor(element, property, newValue, oldValue) {
    super('modify-element', { element, property });
    this.element = element;
    this.property = property;
    this.newValue = newValue;
    this.oldValue = oldValue;
  }

  execute() {
    this.element[this.property] = this.newValue;
    window.ddomeEvents.emit(DDOME_EVENTS.ELEMENT_MODIFIED, {
      element: this.element,
      property: this.property,
      value: this.newValue
    });
  }

  undo() {
    this.element[this.property] = this.oldValue;
    window.ddomeEvents.emit(DDOME_EVENTS.ELEMENT_MODIFIED, {
      element: this.element,
      property: this.property,
      value: this.oldValue
    });
  }

  canMerge(other) {
    return other instanceof ElementModifyCommand &&
           other.element === this.element &&
           other.property === this.property &&
           Date.now() - this.timestamp < 1000;
  }
}

/**
 * @class DDOMECommandManager
 * @description Manages command execution and undo/redo history
 */
class DDOMECommandManager {
  constructor() {
    this.history = [];
    this.currentIndex = -1;
    this.maxHistory = 100;
  }

  /**
   * Executes a command
   * @param {DDOMECommand} command - Command to execute
   */
  execute(command) {
    // Check if we can merge with the last command
    if (this.canMergeWithLast(command)) {
      const lastCommand = this.history[this.currentIndex];
      lastCommand.newValue = command.newValue;
      lastCommand.timestamp = command.timestamp;
      lastCommand.execute();
      return;
    }

    // Remove any commands after current index
    this.history = this.history.slice(0, this.currentIndex + 1);
    
    // Add new command
    this.history.push(command);
    this.currentIndex++;
    
    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
      this.currentIndex--;
    }
    
    command.execute();
  }

  /**
   * Undoes the last command
   * @returns {boolean} Whether undo was successful
   */
  undo() {
    if (this.currentIndex >= 0) {
      this.history[this.currentIndex].undo();
      this.currentIndex--;
      return true;
    }
    return false;
  }

  /**
   * Redoes the next command
   * @returns {boolean} Whether redo was successful
   */
  redo() {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      this.history[this.currentIndex].execute();
      return true;
    }
    return false;
  }

  /**
   * Checks if command can be merged with last command
   * @param {DDOMECommand} command - Command to check
   * @returns {boolean} Whether command can be merged
   */
  canMergeWithLast(command) {
    return this.currentIndex >= 0 && 
           this.history[this.currentIndex].canMerge(command);
  }
}
```

### Plugin Architecture
```javascript
/**
 * @class DDOMEPlugin
 * @description Base class for DDOME plugins
 */
class DDOMEPlugin {
  /**
   * @param {string} name - Plugin name
   * @param {string} version - Plugin version
   */
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.enabled = true;
  }

  /**
   * Initializes the plugin
   * @param {Object} ddome - DDOME instance
   */
  initialize(ddome) {
    this.ddome = ddome;
  }

  /**
   * Registers plugin components
   * @abstract
   */
  register() {
    // Override in subclasses
  }

  /**
   * Cleans up plugin resources
   */
  cleanup() {
    // Override in subclasses
  }
}

/**
 * @class DDOMEPluginManager
 * @description Manages DDOME plugins
 */
class DDOMEPluginManager {
  constructor() {
    this.plugins = new Map();
    this.hooks = new Map();
  }

  /**
   * Registers a plugin
   * @param {DDOMEPlugin} plugin - Plugin to register
   */
  register(plugin) {
    this.plugins.set(plugin.name, plugin);
    plugin.register();
  }

  /**
   * Unregisters a plugin
   * @param {string} name - Plugin name
   */
  unregister(name) {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.cleanup();
      this.plugins.delete(name);
    }
  }

  /**
   * Registers a hook
   * @param {string} name - Hook name
   * @param {Function} callback - Hook callback
   */
  hook(name, callback) {
    if (!this.hooks.has(name)) {
      this.hooks.set(name, []);
    }
    this.hooks.get(name).push(callback);
  }

  /**
   * Executes hooks
   * @param {string} name - Hook name
   * @param {...*} args - Hook arguments
   */
  executeHooks(name, ...args) {
    const hooks = this.hooks.get(name) || [];
    for (const hook of hooks) {
      hook(...args);
    }
  }
}
```

## Dynamic Layout System

### CSS Grid-Based Tiling Engine

DDOME implements a VSCode-style dynamic tiling system using CSS Grid with dynamic track sizing, CSS Custom Properties, and modern JavaScript APIs for responsive panel management.

#### Core Layout Architecture
```javascript
/**
 * @class DDOMETilingSystem
 * @description Advanced tiling system using CSS Grid and modern web APIs
 */
class DDOMETilingSystem {
  constructor(container) {
    this.container = container;
    this.panels = new Map();
    this.splitters = new Map();
    this.resizeObserver = null;
    this.pointerHandler = null;
    this.gridTemplate = {
      columns: [],
      rows: [],
      areas: []
    };
    
    this.initializeGrid();
    this.initializeObservers();
    this.initializePointerEvents();
  }

  /**
   * Initializes CSS Grid with dynamic properties
   */
  initializeGrid() {
    // Set up CSS custom properties for dynamic grid sizing
    this.container.style.setProperty('--grid-gap', '4px');
    this.container.style.setProperty('--splitter-size', '4px');
    this.container.style.setProperty('--min-panel-size', '200px');
    this.container.style.setProperty('--max-panel-size', '1fr');
    
    // Apply base grid styles
    this.container.style.display = 'grid';
    this.container.style.gridGap = 'var(--grid-gap)';
    this.container.style.height = '100vh';
    this.container.style.width = '100vw';
    
    // Set initial layout
    this.updateGridTemplate();
  }

  /**
   * Sets up ResizeObserver for responsive behavior
   */
  initializeObservers() {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.handleContainerResize(entry);
      }
    });
    
    this.resizeObserver.observe(this.container);
  }

  /**
   * Sets up Pointer Events for splitter interaction
   */
  initializePointerEvents() {
    this.pointerHandler = new DDOMEPointerHandler(this);
    
    // Handle pointer events on splitters
    this.container.addEventListener('pointerdown', (event) => {
      if (event.target.classList.contains('ddome-splitter')) {
        this.pointerHandler.startDrag(event);
      }
    });
  }

  /**
   * Adds a panel to the tiling system
   * @param {string} id - Panel ID
   * @param {Object} config - Panel configuration
   */
  addPanel(id, config) {
    const panel = {
      id,
      element: config.element,
      position: config.position || 'center',
      size: config.size || 'auto',
      minSize: config.minSize || '200px',
      maxSize: config.maxSize || '1fr',
      resizable: config.resizable !== false,
      closeable: config.closeable !== false,
      tabs: config.tabs || []
    };
    
    this.panels.set(id, panel);
    this.insertPanel(panel);
    this.updateGridTemplate();
  }

  /**
   * Removes a panel from the tiling system
   * @param {string} id - Panel ID
   */
  removePanel(id) {
    const panel = this.panels.get(id);
    if (panel && panel.element.parentNode) {
      panel.element.parentNode.removeChild(panel.element);
    }
    
    this.panels.delete(id);
    this.updateGridTemplate();
  }

  /**
   * Updates CSS Grid template based on current panels
   */
  updateGridTemplate() {
    const layout = this.calculateLayout();
    
    // Update grid template columns
    this.container.style.gridTemplateColumns = layout.columns.join(' ');
    
    // Update grid template rows  
    this.container.style.gridTemplateRows = layout.rows.join(' ');
    
    // Update grid template areas
    this.container.style.gridTemplateAreas = layout.areas
      .map(row => `"${row.join(' ')}"`)
      .join(' ');
      
    // Update splitters
    this.updateSplitters(layout);
  }

  /**
   * Calculates optimal grid layout based on panels
   * @returns {Object} Layout configuration
   */
  calculateLayout() {
    const panelsByPosition = this.groupPanelsByPosition();
    
    // Calculate columns: left sidebar + center + right sidebar
    const columns = [];
    const areas = [];
    
    // Left sidebar
    if (panelsByPosition.left.length > 0) {
      columns.push(`minmax(var(--min-panel-size), ${this.getPanelSize('left')})`);
      if (panelsByPosition.center.length > 0 || panelsByPosition.right.length > 0) {
        columns.push('var(--splitter-size)'); // Splitter
      }
    }
    
    // Center area
    if (panelsByPosition.center.length > 0) {
      columns.push('1fr');
      if (panelsByPosition.right.length > 0) {
        columns.push('var(--splitter-size)'); // Splitter
      }
    }
    
    // Right sidebar
    if (panelsByPosition.right.length > 0) {
      columns.push(`minmax(var(--min-panel-size), ${this.getPanelSize('right')})`);
    }
    
    // Calculate rows: top + center + bottom
    const rows = [];
    
    // Top panels
    if (panelsByPosition.top.length > 0) {
      rows.push(`minmax(var(--min-panel-size), ${this.getPanelSize('top')})`);
      rows.push('var(--splitter-size)'); // Splitter
    }
    
    // Main content area
    rows.push('1fr');
    
    // Bottom panels
    if (panelsByPosition.bottom.length > 0) {
      rows.push('var(--splitter-size)'); // Splitter
      rows.push(`minmax(var(--min-panel-size), ${this.getPanelSize('bottom')})`);
    }
    
    // Generate grid areas
    const areaRows = this.generateGridAreas(panelsByPosition, columns.length, rows.length);
    
    return {
      columns,
      rows,
      areas: areaRows
    };
  }

  /**
   * Groups panels by position
   * @returns {Object} Panels grouped by position
   */
  groupPanelsByPosition() {
    const groups = {
      left: [],
      right: [],
      top: [],
      bottom: [],
      center: []
    };
    
    for (const panel of this.panels.values()) {
      groups[panel.position].push(panel);
    }
    
    return groups;
  }

  /**
   * Gets panel size for position
   * @param {string} position - Panel position
   * @returns {string} CSS size value
   */
  getPanelSize(position) {
    const panels = Array.from(this.panels.values())
      .filter(p => p.position === position);
      
    if (panels.length === 0) return 'auto';
    
    // Use first panel's size or default
    return panels[0].size || '300px';
  }

  /**
   * Generates grid area definitions
   * @param {Object} panelsByPosition - Panels grouped by position
   * @param {number} colCount - Column count
   * @param {number} rowCount - Row count
   * @returns {Array} Grid area rows
   */
  generateGridAreas(panelsByPosition, colCount, rowCount) {
    const areas = [];
    
    // This is a simplified version - would need more complex logic
    // for handling all possible panel combinations
    
    if (rowCount === 1) {
      // Single row layout
      const row = [];
      if (panelsByPosition.left.length > 0) row.push('left');
      if (panelsByPosition.center.length > 0) row.push('center');
      if (panelsByPosition.right.length > 0) row.push('right');
      areas.push(row);
    } else {
      // Multi-row layout
      // Top row
      if (panelsByPosition.top.length > 0) {
        areas.push(['top', 'top', 'top']);
      }
      
      // Middle row
      const middleRow = [];
      if (panelsByPosition.left.length > 0) middleRow.push('left');
      if (panelsByPosition.center.length > 0) middleRow.push('center');
      if (panelsByPosition.right.length > 0) middleRow.push('right');
      areas.push(middleRow);
      
      // Bottom row
      if (panelsByPosition.bottom.length > 0) {
        areas.push(['bottom', 'bottom', 'bottom']);
      }
    }
    
    return areas;
  }

  /**
   * Updates splitter elements
   * @param {Object} layout - Layout configuration
   */
  updateSplitters(layout) {
    // Remove existing splitters
    this.container.querySelectorAll('.ddome-splitter').forEach(el => el.remove());
    
    // Add new splitters based on layout
    this.addSplitters(layout);
  }

  /**
   * Adds splitter elements
   * @param {Object} layout - Layout configuration
   */
  addSplitters(layout) {
    // Vertical splitters
    const verticalSplitters = this.calculateVerticalSplitters(layout);
    verticalSplitters.forEach(splitter => {
      const element = this.createSplitter('vertical', splitter);
      this.container.appendChild(element);
    });
    
    // Horizontal splitters
    const horizontalSplitters = this.calculateHorizontalSplitters(layout);
       horizontalSplitters.forEach(splitter => {
      const element = this.createSplitter('horizontal', splitter);
      this.container.appendChild(element);
    });
  }

  /**
   * Creates a splitter element
   * @param {string} orientation - 'vertical' or 'horizontal'
   * @param {Object} config - Splitter configuration
   * @returns {HTMLElement} Splitter element
   */
  createSplitter(orientation, config) {
    const splitter = document.createElement('div');
    splitter.className = `ddome-splitter ddome-splitter-${orientation}`;
    splitter.style.gridArea = config.gridArea;
    splitter.style.cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize';
    splitter.style.backgroundColor = 'var(--border-color)';
    splitter.style.zIndex = '1000';
    
    // Add hover effect
    splitter.addEventListener('mouseenter', () => {
      splitter.style.backgroundColor = 'var(--accent-color)';
    });
    
    splitter.addEventListener('mouseleave', () => {
      splitter.style.backgroundColor = 'var(--border-color)';
    });
    
    return splitter;
  }

  /**
   * Handles container resize
   * @param {ResizeObserverEntry} entry - Resize observer entry
   */
  handleContainerResize(entry) {
    const { width, height } = entry.contentRect;
    
    // Update CSS custom properties
    this.container.style.setProperty('--container-width', `${width}px`);
    this.container.style.setProperty('--container-height', `${height}px`);
    
    // Recalculate layout if needed
    this.updateGridTemplate();
    
    // Emit resize event
    this.container.dispatchEvent(new CustomEvent('layout-resize', {
      detail: { width, height }
    }));
  }
}

/**
 * @class DDOMEPointerHandler
 * @description Handles pointer events for splitter dragging
 */
class DDOMEPointerHandler {
  constructor(tilingSystem) {
    this.tilingSystem = tilingSystem;
    this.isDragging = false;
    this.currentSplitter = null;
    this.startPosition = null;
    this.startSizes = null;
  }

  /**
   * Starts drag operation
   * @param {PointerEvent} event - Pointer event
   */
  startDrag(event) {
    this.isDragging = true;
    this.currentSplitter = event.target;
    this.startPosition = { x: event.clientX, y: event.clientY };
    
    // Capture pointer
    this.currentSplitter.setPointerCapture(event.pointerId);
    
    // Store initial sizes
    this.startSizes = this.captureCurrentSizes();
    
    // Add global event listeners
    document.addEventListener('pointermove', this.handleDrag.bind(this));
    document.addEventListener('pointerup', this.endDrag.bind(this));
    
    // Prevent default behavior
    event.preventDefault();
  }

  /**
   * Handles drag movement
   * @param {PointerEvent} event - Pointer event
   */
  handleDrag(event) {
    if (!this.isDragging) return;
    
    const deltaX = event.clientX - this.startPosition.x;
    const deltaY = event.clientY - this.startPosition.y;
    
    // Update panel sizes based on drag
    this.updatePanelSizes(deltaX, deltaY);
    
    // Update grid template
    this.tilingSystem.updateGridTemplate();
  }

  /**
   * Ends drag operation
   * @param {PointerEvent} event - Pointer event
   */
  endDrag(event) {
    if (!this.isDragging) return;
    
    this.isDragging = false;
    this.currentSplitter = null;
    
    // Remove global event listeners
    document.removeEventListener('pointermove', this.handleDrag);
    document.removeEventListener('pointerup', this.endDrag);
    
    // Save final layout
    this.tilingSystem.saveLayout();
  }

  /**
   * Captures current panel sizes
   * @returns {Object} Current sizes
   */
  captureCurrentSizes() {
    const sizes = {};
    
    for (const [id, panel] of this.tilingSystem.panels) {
      const rect = panel.element.getBoundingClientRect();
      sizes[id] = {
        width: rect.width,
        height: rect.height
      };
    }
    
    return sizes;
  }

  /**
   * Updates panel sizes during drag
   * @param {number} deltaX - X movement
   * @param {number} deltaY - Y movement
   */
  updatePanelSizes(deltaX, deltaY) {
    const splitterType = this.currentSplitter.classList.contains('ddome-splitter-vertical') 
      ? 'vertical' : 'horizontal';
      
    if (splitterType === 'vertical') {
      this.updateVerticalSizes(deltaX);
    } else {
      this.updateHorizontalSizes(deltaY);
    }
  }

  /**
   * Updates sizes for vertical splitter drag
   * @param {number} deltaX - X movement
   */
  updateVerticalSizes(deltaX) {
    // Find panels on left and right of splitter
    const leftPanels = this.findPanelsOnSide('left');
    const rightPanels = this.findPanelsOnSide('right');
    
    // Update sizes
    leftPanels.forEach(panel => {
      const newWidth = this.startSizes[panel.id].width + deltaX;
      const clampedWidth = Math.max(200, Math.min(newWidth, 800));
      panel.size = `${clampedWidth}px`;
    });
    
    rightPanels.forEach(panel => {
      const newWidth = this.startSizes[panel.id].width - deltaX;
      const clampedWidth = Math.max(200, Math.min(newWidth, 800));
      panel.size = `${clampedWidth}px`;
    });
  }

  /**
   * Updates sizes for horizontal splitter drag
   * @param {number} deltaY - Y movement
   */
  updateHorizontalSizes(deltaY) {
    // Similar logic for horizontal sizing
    const topPanels = this.findPanelsOnSide('top');
    const bottomPanels = this.findPanelsOnSide('bottom');
    
    topPanels.forEach(panel => {
      const newHeight = this.startSizes[panel.id].height + deltaY;
      const clampedHeight = Math.max(100, Math.min(newHeight, 600));
      panel.size = `${clampedHeight}px`;
    });
    
    bottomPanels.forEach(panel => {
      const newHeight = this.startSizes[panel.id].height - deltaY;
      const clampedHeight = Math.max(100, Math.min(newHeight, 600));
      panel.size = `${clampedHeight}px`;
    });
  }

  /**
   * Finds panels on specified side of splitter
   * @param {string} side - Side to find panels on
   * @returns {Array} Panels on that side
   */
  findPanelsOnSide(side) {
    return Array.from(this.tilingSystem.panels.values())
      .filter(panel => panel.position === side);
  }
}
```

### Dynamic Tab Management System

DDOME implements a VSCode-style dynamic tab system that allows multiple pages, components, and other resources to be opened simultaneously.

#### Tab Management Architecture
```javascript
/**
 * @class DDOMETabManager
 * @description Manages dynamic tabs with VSCode-style behavior
 */
class DDOMETabManager {
  constructor(container) {
    this.container = container;
    this.tabs = new Map();
    this.activeTab = null;
    this.tabOrder = [];
    this.maxTabs = 20;
    
    this.initializeTabContainer();
    this.setupEventHandlers();
  }

  /**
   * Initializes tab container structure
   */
  initializeTabContainer() {
    this.container.innerHTML = `
      <div class="ddome-tab-bar">
        <div class="ddome-tab-list" role="tablist"></div>
        <div class="ddome-tab-actions">
          <button class="ddome-tab-overflow" title="More tabs...">⋯</button>
        </div>
      </div>
      <div class="ddome-tab-content">
        <!-- Tab content panels -->
      </div>
    `;
    
    this.tabList = this.container.querySelector('.ddome-tab-list');
    this.tabContent = this.container.querySelector('.ddome-tab-content');
  }

  /**
   * Sets up event handlers for tabs
   */
  setupEventHandlers() {
    // Tab switching
    this.tabList.addEventListener('click', (event) => {
      const tabElement = event.target.closest('.ddome-tab');
      if (tabElement) {
        const tabId = tabElement.dataset.tabId;
        this.activateTab(tabId);
      }
    });

    // Tab closing
    this.tabList.addEventListener('click', (event) => {
      if (event.target.classList.contains('ddome-tab-close')) {
        const tabElement = event.target.closest('.ddome-tab');
        const tabId = tabElement.dataset.tabId;
        this.closeTab(tabId);
        event.stopPropagation();
      }
    });

    // Tab dragging for reordering
    this.tabList.addEventListener('dragstart', this.handleTabDragStart.bind(this));
    this.tabList.addEventListener('dragover', this.handleTabDragOver.bind(this));
    this.tabList.addEventListener('drop', this.handleTabDrop.bind(this));

    // Keyboard navigation
    this.container.addEventListener('keydown', this.handleKeyboard.bind(this));
  }

  /**
   * Opens a new tab
   * @param {Object} tabConfig - Tab configuration
   * @returns {string} Tab ID
   */
  openTab(tabConfig) {
    const tabId = tabConfig.id || this.generateTabId();
    
    // Check if tab already exists
    if (this.tabs.has(tabId)) {
      this.activateTab(tabId);
      return tabId;
    }

    // Check tab limit
    if (this.tabs.size >= this.maxTabs) {
      this.closeOldestTab();
    }

    const tab = {
      id: tabId,
      title: tabConfig.title || 'Untitled',
      type: tabConfig.type || 'unknown',
      icon: tabConfig.icon || this.getDefaultIcon(tabConfig.type),
      content: tabConfig.content,
      closeable: tabConfig.closeable !== false,
      modified: tabConfig.modified || false,
      path: tabConfig.path || '',
      metadata: tabConfig.metadata || {}
    };

    // Create tab element
    const tabElement = this.createTabElement(tab);
    
    // Create content panel
    const contentPanel = this.createContentPanel(tab);
    
    // Add to data structures
    this.tabs.set(tabId, tab);
    this.tabOrder.push(tabId);
    
    // Add to DOM
    this.tabList.appendChild(tabElement);
    this.tabContent.appendChild(contentPanel);
    
    // Activate new tab
    this.activateTab(tabId);
    
    // Emit event
    this.container.dispatchEvent(new CustomEvent('tab-opened', {
      detail: { tab, tabId }
    }));
    
    return tabId;
  }

  /**
   * Closes a tab
   * @param {string} tabId - Tab ID to close
   */
  closeTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    // Check if tab can be closed
    if (!tab.closeable) return;

    // Check for unsaved changes
    if (tab.modified) {
      const shouldClose = this.confirmClose(tab);
      if (!shouldClose) return;
    }

    // Remove from data structures
    this.tabs.delete(tabId);
    this.tabOrder = this.tabOrder.filter(id => id !== tabId);

    // Remove from DOM
    const tabElement = this.tabList.querySelector(`[data-tab-id="${tabId}"]`);
    const contentPanel = this.tabContent.querySelector(`[data-tab-id="${tabId}"]`);
    
    if (tabElement) tabElement.remove();
    if (contentPanel) contentPanel.remove();

    // Activate another tab if this was active
    if (this.activeTab === tabId) {
      const nextTab = this.findNextActiveTab();
      if (nextTab) {
        this.activateTab(nextTab);
      } else {
        this.activeTab = null;
      }
    }

    // Emit event
    this.container.dispatchEvent(new CustomEvent('tab-closed', {
      detail: { tab, tabId }
    }));
  }

  /**
   * Activates a tab
   * @param {string} tabId - Tab ID to activate
   */
  activateTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    // Deactivate current tab
    if (this.activeTab) {
      this.deactivateTab(this.activeTab);
    }

    // Activate new tab
    this.activeTab = tabId;
    
    // Update DOM
    const tabElement = this.tabList.querySelector(`[data-tab-id="${tabId}"]`);
    const contentPanel = this.tabContent.querySelector(`[data-tab-id="${tabId}"]`);
    
    if (tabElement) {
      tabElement.classList.add('active');
      tabElement.setAttribute('aria-selected', 'true');
    }
    
    if (contentPanel) {
      contentPanel.classList.add('active');
    }

    // Move to front of order
    this.tabOrder = this.tabOrder.filter(id => id !== tabId);
    this.tabOrder.unshift(tabId);

    // Update outline/explorer for this tab
    this.updateOutlineForTab(tab);

    // Emit event
    this.container.dispatchEvent(new CustomEvent('tab-activated', {
      detail: { tab, tabId }
    }));
  }

  /**
   * Deactivates a tab
   * @param {string} tabId - Tab ID to deactivate
   */
  deactivateTab(tabId) {
    const tabElement = this.tabList.querySelector(`[data-tab-id="${tabId}"]`);
    const contentPanel = this.tabContent.querySelector(`[data-tab-id="${tabId}"]`);
    
    if (tabElement) {
      tabElement.classList.remove('active');
      tabElement.setAttribute('aria-selected', 'false');
    }
    
    if (contentPanel) {
      contentPanel.classList.remove('active');
    }
  }

  /**
   * Creates tab element
   * @param {Object} tab - Tab configuration
   * @returns {HTMLElement} Tab element
   */
  createTabElement(tab) {
    const tabElement = document.createElement('div');
    tabElement.className = 'ddome-tab';
    tabElement.setAttribute('role', 'tab');
    tabElement.setAttribute('data-tab-id', tab.id);
    tabElement.setAttribute('draggable', 'true');
    
    tabElement.innerHTML = `
      <span class="ddome-tab-icon">${tab.icon}</span>
      <span class="ddome-tab-title">${this.formatTabTitle(tab)}</span>
      ${tab.modified ? '<span class="ddome-tab-modified">●</span>' : ''}
      ${tab.closeable ? '<button class="ddome-tab-close" title="Close">×</button>' : ''}
    `;
    
    return tabElement;
  }

  /**
   * Creates content panel for tab
   * @param {Object} tab - Tab configuration
   * @returns {HTMLElement} Content panel
   */
  createContentPanel(tab) {
    const panel = document.createElement('div');
    panel.className = 'ddome-tab-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('data-tab-id', tab.id);
    
    // Load content based on tab type
    this.loadTabContent(panel, tab);
    
    return panel;
  }

  /**
   * Loads content into tab panel based on type
   * @param {HTMLElement} panel - Content panel
   * @param {Object} tab - Tab configuration
   */
  loadTabContent(panel, tab) {
    switch (tab.type) {
      case 'application':
        this.loadApplicationContent(panel, tab);
        break;
      case 'page':
        this.loadPageContent(panel, tab);
        break;
      case 'component':
        this.loadComponentContent(panel, tab);
        break;
      case 'module':
        this.loadModuleContent(panel, tab);
        break;
      case 'request':
        this.loadRequestContent(panel, tab);
        break;
      case 'stylebook':
        this.loadStylebookContent(panel, tab);
        break;
      default:
        panel.innerHTML = '<div class="ddome-empty-tab">Unknown content type</div>';
    }
  }

  /**
   * Updates outline/explorer for active tab
   * @param {Object} tab - Active tab
   */
  updateOutlineForTab(tab) {
    const outlinePanel = document.querySelector('.ddome-outline');
    if (!outlinePanel) return;

    // Clear existing outline
    outlinePanel.innerHTML = '';

    // Load outline based on tab type
    switch (tab.type) {
      case 'application':
        this.loadApplicationOutline(outlinePanel, tab);
        break;
      case 'page':
        this.loadPageOutline(outlinePanel, tab);
        break;
      case 'component':
        this.loadComponentOutline(outlinePanel, tab);
        break;
      default:
        outlinePanel.innerHTML = '<div class="ddome-outline-empty">No outline available</div>';
    }
  }

  /**
   * Formats tab title with ellipsis for long names
   * @param {Object} tab - Tab configuration
   * @returns {string} Formatted title
   */
  formatTabTitle(tab) {
    const maxLength = 15;
    if (tab.title.length <= maxLength) {
      return tab.title;
    }
    return tab.title.substring(0, maxLength - 3) + '...';
  }

  /**
   * Gets default icon for tab type
   * @param {string} type - Tab type
   * @returns {string} Icon character or HTML
   */
  getDefaultIcon(type) {
    const icons = {
      application: '🏠',
      page: '📄',
      component: '🧩',
      module: '⚙️',
      request: '🌐',
      stylebook: '🎨'
    };
    return icons[type] || '📄';
  }

  /**
   * Handles tab drag start
   * @param {DragEvent} event - Drag event
   */
  handleTabDragStart(event) {
    if (!event.target.classList.contains('ddome-tab')) return;
    
    const tabId = event.target.dataset.tabId;
    event.dataTransfer.setData('text/plain', tabId);
    event.dataTransfer.effectAllowed = 'move';
    
    event.target.classList.add('dragging');
  }

  /**
   * Handles tab drag over
   * @param {DragEvent} event - Drag event
   */
  handleTabDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    const tabElement = event.target.closest('.ddome-tab');
    if (tabElement && !tabElement.classList.contains('dragging')) {
      tabElement.classList.add('drop-target');
    }
  }

  /**
   * Handles tab drop
   * @param {DragEvent} event - Drag event
   */
  handleTabDrop(event) {
    event.preventDefault();
    
    const draggedTabId = event.dataTransfer.getData('text/plain');
    const targetTab = event.target.closest('.ddome-tab');
    
    if (targetTab && draggedTabId) {
      const targetTabId = targetTab.dataset.tabId;
      this.reorderTabs(draggedTabId, targetTabId);
    }
    
    // Clean up drag classes
    this.tabList.querySelectorAll('.dragging, .drop-target').forEach(el => {
      el.classList.remove('dragging', 'drop-target');
    });
  }

  /**
   * Reorders tabs
   * @param {string} draggedTabId - ID of dragged tab
   * @param {string} targetTabId - ID of target tab
   */
  reorderTabs(draggedTabId, targetTabId) {
    const draggedIndex = this.tabOrder.indexOf(draggedTabId);
    const targetIndex = this.tabOrder.indexOf(targetTabId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Reorder in data structure
    this.tabOrder.splice(draggedIndex, 1);
    this.tabOrder.splice(targetIndex, 0, draggedTabId);
    
    // Reorder in DOM
    const draggedElement = this.tabList.querySelector(`[data-tab-id="${draggedTabId}"]`);
    const targetElement = this.tabList.querySelector(`[data-tab-id="${targetTabId}"]`);
    
    if (draggedElement && targetElement) {
      this.tabList.insertBefore(draggedElement, targetElement);
    }
  }

  /**
   * Handles keyboard navigation
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleKeyboard(event) {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'w':
          // Close active tab
          if (this.activeTab) {
            this.closeTab(this.activeTab);
          }
          event.preventDefault();
          break;
        case 'Tab':
          // Switch between tabs
          const direction = event.shiftKey ? -1 : 1;
          this.switchToNextTab(direction);
          event.preventDefault();
          break;
      }
    }
  }

  /**
   * Switches to next/previous tab
   * @param {number} direction - Direction (1 for next, -1 for previous)
   */
  switchToNextTab(direction) {
    if (this.tabOrder.length === 0) return;
    
    const currentIndex = this.tabOrder.indexOf(this.activeTab);
    let nextIndex = currentIndex + direction;
    
    if (nextIndex >= this.tabOrder.length) {
      nextIndex = 0;
    } else if (nextIndex < 0) {
      nextIndex = this.tabOrder.length - 1;
    }
    
    const nextTabId = this.tabOrder[nextIndex];
    this.activateTab(nextTabId);
  }

  /**
   * Finds next tab to activate after closing current
   * @returns {string|null} Next tab ID or null
   */
  findNextActiveTab() {
    if (this.tabOrder.length === 0) return null;
    
    // Return most recently used tab
    return this.tabOrder[0];
  }

  /**
   * Generates unique tab ID
   * @returns {string} Unique tab ID
   */
  generateTabId() {
    return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Confirms closing modified tab
   * @param {Object} tab - Tab to close
   * @returns {boolean} Whether to proceed with close
   */
  confirmClose(tab) {
    return confirm(`${tab.title} has unsaved changes. Close anyway?`);
  }

  /**
   * Closes oldest unused tab when limit reached
   */
  closeOldestTab() {
    if (this.tabOrder.length === 0) return;
    
    // Find oldest tab that's not active
    const oldestTab = this.tabOrder[this.tabOrder.length - 1];
    if (oldestTab !== this.activeTab) {
      this.closeTab(oldestTab);
    }
  }
}
```