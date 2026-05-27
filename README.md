# react-bare-tab-component

React tab component for PRO.

- Type safe
- CSS free
- Easy to customize

## Install

```sh
$ npm i react-bare-tab-component
```

## Sync with history / external state

This package has **no dependency** on any router or `history` library.
To sync the current tab with the browser history, URL, `localStorage`, etc.,
inject an adapter that implements `TabStateSync` into the `sync` prop.

```ts
export type TabStateSync<Keys extends string> = {
  /** Read the persisted tab key. Used for the initial state. */
  read(): Keys | undefined;
  /** Persist a tab change as a new entry (history.push). */
  push(key: Keys): void;
  /** Seed the initial tab key without a new entry (history.replace). */
  replace(key: Keys): void;
  /** Subscribe to external changes (back/forward). Returns unsubscribe. */
  subscribe(onChange: (key: Keys) => void): () => void;
};
```

Example adapter for the [`history`](https://www.npmjs.com/package/history) package
(also works with any router exposing a compatible history object):

```tsx
import {Action, type History} from 'history';
import type {TabStateSync} from 'react-bare-tab-component';

function createHistorySync<Keys extends string>(history: History, key: string): TabStateSync<Keys> {
  return {
    read: () => (history.location.state as Record<string, Keys> | null)?.[key],
    push: (k) => history.push('', {[key]: k}),
    replace: (k) => history.replace('', {[key]: k}),
    subscribe: (onChange) =>
      history.listen(({action, location}) => {
        if (action !== Action.Pop) return;
        const state = location.state as Record<string, Keys> | null;
        if (state != null && key in state) onChange(state[key]!);
      }),
  };
}

// usage
const sync = useMemo(() => createHistorySync<TabKey>(history, 'my-tab'), [history]);
<Tab sync={sync}>{/* ... */}</Tab>;
```

