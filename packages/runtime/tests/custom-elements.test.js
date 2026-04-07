import { describe, test, expect, beforeEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

// Register Happy DOM globals
try { GlobalRegistrator.register(); } catch { /* already registered */ }

// Import after DOM globals are available
import { defineElement, JSONsx, renderNode, buildScope, RESERVED_KEYS } from '../runtime.js';

describe('Custom Elements', () => {

  test('RESERVED_KEYS includes $elements and observedAttributes', () => {
    expect(RESERVED_KEYS.has('$elements')).toBe(true);
    expect(RESERVED_KEYS.has('observedAttributes')).toBe(true);
  });

  test('defineElement registers a custom element from a raw object', async () => {
    const doc = {
      tagName: 'test-basic',
      $defs: {
        greeting: 'Hello',
      },
      children: [
        { tagName: 'span', textContent: '${$defs.greeting}' }
      ],
    };

    await defineElement(doc);

    // Verify the element is registered
    expect(customElements.get('test-basic')).toBeDefined();

    // Create an instance and connect it
    const el = document.createElement('test-basic');
    document.body.appendChild(el);

    // Wait for async connectedCallback
    await new Promise(r => setTimeout(r, 50));

    // Should have rendered the template
    const span = el.querySelector('span');
    expect(span).toBeDefined();
    expect(span.textContent).toBe('Hello');

    document.body.removeChild(el);
  });

  test('defineElement with $props sets JS properties on instance', async () => {
    // Register a child element
    const childDoc = {
      tagName: 'test-props-child',
      $defs: {
        label: 'default',
      },
      children: [
        { tagName: 'span', textContent: '${$defs.label}' }
      ],
    };
    await defineElement(childDoc);

    // Create as renderNode would — set label as a JS property
    const el = document.createElement('test-props-child');
    el.label = 'overridden';
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 50));

    const span = el.querySelector('span');
    expect(span).toBeDefined();
    expect(span.textContent).toBe('overridden');

    document.body.removeChild(el);
  });

  test('defineElement with lifecycle hooks', async () => {
    const doc = {
      tagName: 'test-lifecycle',
      $defs: {
        mountCalled: false,
        onMount: {
          $prototype: 'Function',
          body: '$defs.mountCalled = true',
        },
        onUnmount: {
          $prototype: 'Function',
          body: '', // We can't easily test this with inline body, but verify it doesn't throw
        },
      },
      children: [
        { tagName: 'div', textContent: 'lifecycle test' }
      ],
    };

    await defineElement(doc);

    const el = document.createElement('test-lifecycle');
    document.body.appendChild(el);

    // Wait for async connectedCallback + queueMicrotask for onMount
    await new Promise(r => setTimeout(r, 200));

    // The element should have rendered
    const div = el.querySelector('div');
    expect(div).toBeDefined();
    expect(div.textContent).toBe('lifecycle test');

    // onMount should have been called (sets mountCalled on the internal scope)
    // Access through the element's exposed property (set via Object.defineProperty)
    expect(el.mountCalled).toBe(true);

    // disconnectedCallback should not throw
    document.body.removeChild(el);
  });

  test('defineElement throws for non-hyphenated tagName', async () => {
    try {
      await defineElement({ tagName: 'nocustomel', $defs: {} });
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e.message).toContain('must contain a hyphen');
    }
  });

  test('defineElement skips already-registered elements', async () => {
    // test-basic was registered above — should not throw
    await defineElement({
      tagName: 'test-basic',
      $defs: { greeting: 'Different' },
      children: [],
    });
    // Should still be the original
    expect(customElements.get('test-basic')).toBeDefined();
  });

  test('renderNode creates custom element with $props', async () => {
    // Register an element
    const doc = {
      tagName: 'test-render-child',
      $defs: {
        value: 0,
        name: 'none',
      },
      children: [
        { tagName: 'span', className: 'val', textContent: '${$defs.value}' },
        { tagName: 'span', className: 'name', textContent: '${$defs.name}' },
      ],
    };
    await defineElement(doc);

    // Now use renderNode with a parent that passes $props
    const parentDef = {
      tagName: 'div',
      children: [{
        tagName: 'test-render-child',
        $props: {
          value: 42,
          name: 'test',
        },
      }],
    };
    const parentScope = await buildScope({ $defs: {} });
    const el = renderNode(parentDef, parentScope);
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 100));

    const child = el.querySelector('test-render-child');
    expect(child).toBeDefined();

    const valSpan = child.querySelector('.val');
    const nameSpan = child.querySelector('.name');
    expect(valSpan.textContent).toBe('42');
    expect(nameSpan.textContent).toBe('test');

    document.body.removeChild(el);
  });
});
