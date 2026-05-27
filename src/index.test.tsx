import React, {useEffect, useMemo, useState} from 'react';

import {render, screen, waitFor} from '@testing-library/react';
//  because of a bug
//  eslint-disable-next-line testing-library/no-manual-cleanup
import {cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Action, createMemoryHistory} from 'history';
import type {History} from 'history';
import {describe, expect, test, afterEach} from 'vitest';

import tabFactory, {type TabStateSync} from './';

afterEach(cleanup);

const TEST_SYNCHRONIZE_HISTORY_KEY = 'test-main';

type TestTabKey = 'x' | 'y' | 'z';

const {Tab, TabList, TabNav, TabPanel, useTabState} = tabFactory<TestTabKey>('y');

/**
 * `history` を `TabStateSync` に適合させるアダプタ。
 * コアは history 非依存なので、結合はこのように利用側で注入する。
 */
function createHistorySync<Keys extends string>(history: History, key: string): TabStateSync<Keys> {
  return {
    read: () => (history.location.state as Record<string, Keys> | null)?.[key],
    push: (k) => history.push('', {[key]: k}),
    replace: (k) => history.replace('', {[key]: k}),
    subscribe: (onChange) =>
      history.listen(({action, location}) => {
        if (action !== Action.Pop) {
          return;
        }
        const state = location.state as Record<string, Keys> | null;
        if (state != null && key in state) {
          onChange(state[key]!);
        }
      }),
  };
}

type Props = {
  lazy?: ReadonlyArray<TestTabKey>;
  forceRemount?: ReadonlyArray<TestTabKey>;
  history?: History;
  overwriteDefault?: TestTabKey;
};

function TabKeyWatcher() {
  const [key, _setKey] = useTabState();

  return <div>tab key is: {key}</div>;
}

/** useTabState の setter を値・更新関数の両形式で行使する。 */
function TabSwitcher() {
  const [, setKey] = useTabState();
  return (
    <>
      <button type="button" onClick={() => setKey('x')}>
        switch to x
      </button>
      <button type="button" onClick={() => setKey((prev) => (prev === 'y' ? 'z' : 'y'))}>
        toggle y/z
      </button>
    </>
  );
}

function TabPage(props: Props) {
  const {lazy = [], forceRemount = [], history, overwriteDefault} = props;
  const sync = useMemo(
    () => (history == null ? undefined : createHistorySync<TestTabKey>(history, TEST_SYNCHRONIZE_HISTORY_KEY)),
    [history],
  );
  return (
    <React.StrictMode>
      <Tab sync={sync} overwriteDefault={overwriteDefault}>
        <TabList>
          <TabNav tabKey="x">tab nav x</TabNav>
          <TabNav tabKey="y">tab nav y</TabNav>
          <TabNav tabKey="z">tab nav z</TabNav>
        </TabList>
        <TabKeyWatcher />
        <TabSwitcher />
        <TabPanel tabKey="x" lazy={lazy.includes('x')} forceRemount={forceRemount.includes('x')}>
          tab content of x
        </TabPanel>
        <TabPanel tabKey="y" lazy={lazy.includes('y')} forceRemount={forceRemount.includes('y')}>
          tab content of y
        </TabPanel>
        <TabPanel tabKey="z" lazy={lazy.includes('z')} forceRemount={forceRemount.includes('z')}>
          tab content of z
        </TabPanel>
      </Tab>
    </React.StrictMode>
  );
}

describe('BareTabComponent', () => {
  function TestMain(props: Props) {
    const {history} = props;

    const [loc, setPath] = useState(history?.location);
    useEffect(() => {
      if (history == null) {
        return;
      }

      return history.listen(({location}) => {
        setPath(location);
      });
    }, [history]);

    if (loc == null) {
      return <TabPage {...props} />;
    }

    if (loc.pathname === '/some-other') {
      return (
        <>
          <TabKeyWatcher />
          <div>some other page</div>
        </>
      );
    } else {
      return <TabPage {...props} />;
    }
  }

  const isSomeOtherPage = () => screen.getByText('some other page') != null;
  const getTabNav = (k: TestTabKey) => screen.getByText(`tab nav ${k}`);
  const getTabPanel = (k: TestTabKey) => screen.getByText(`tab content of ${k}`);
  const queryTabPanel = (k: TestTabKey) => screen.queryByText(`tab content of ${k}`);
  const queryCurrentTabKeyState = (k: TestTabKey) => screen.getByText(`tab key is: ${k}`);

  test('shows default pane on init.', () => {
    render(<TestMain />);

    // happy-domはariaSelectedをサポートしていないっぽい？
    const notSelectedButtons = screen.getAllByRole('tab', {selected: false});
    expect(notSelectedButtons[0]?.textContent).toBe('tab nav x');
    expect(notSelectedButtons[1]?.textContent).toBe('tab nav z');

    expect(screen.getByRole('tab', {selected: true}).textContent).toBe('tab nav y');

    expect(getTabPanel('x').hidden).toBeTruthy();
    expect(getTabPanel('y').hidden).toBeFalsy();
    expect(getTabPanel('z').hidden).toBeTruthy();
  });

  test('tab panel will not be render until clicked if lazy option applied.', async () => {
    render(<TestMain lazy={['z']} />);

    expect(queryTabPanel('z')).toBeNull();

    await userEvent.click(getTabNav('z'));

    expect(getTabPanel('z')).toBeDefined();

    await userEvent.click(getTabNav('x'));

    // now it's rendered but hidden
    expect(getTabPanel('z').hidden).toBeTruthy();
  });

  test('will be able to synchronize with history object.', async () => {
    const history = createMemoryHistory();

    render(<TestMain history={history} />);

    //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect((history.location.state as any)['test-main']).toBe('y');

    await userEvent.click(getTabNav('z'));

    //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect((history.location.state as any)['test-main']).toBe('z');
    expect(getTabPanel('z').hidden).toBeFalsy();

    history.back();

    // tab is also backed if `history.back` was called
    await waitFor(() => expect(getTabPanel('z').hidden).toBeTruthy(), {timeout: 100});
    expect(getTabPanel('y').hidden).toBeFalsy();

    history.push('', {[TEST_SYNCHRONIZE_HISTORY_KEY]: 'x'});

    // `history.push` synchronization is not supported so far
    await waitFor(() => expect(getTabPanel('z').hidden).toBeTruthy(), {timeout: 100});
    expect(getTabPanel('y').hidden).toBeFalsy();
  });

  test('has no history duplication on init if React is development mode', async () => {
    const history = createMemoryHistory();

    render(
      <React.StrictMode>
        <TestMain history={history} />
      </React.StrictMode>,
    );

    expect(history.index).toBe(0);

    await userEvent.click(getTabNav('z'));
    expect(history.index).toBe(1);

    history.back();

    expect(history.index).toBe(0);
  });

  test('revoke tab position on history back from other page', async () => {
    const history = createMemoryHistory({
      initialEntries: [
        {pathname: '/', state: {'test-main': 'y'}},
        {pathname: '/', state: {'test-main': 'x'}},
        {pathname: '/', state: {'test-main': 'z'}},
        {pathname: '/some-other'},
      ],
    });

    render(<TestMain history={history} />);

    await waitFor(() => expect(isSomeOtherPage()).toBeTruthy(), {timeout: 100});

    history.back();
    await waitFor(() => expect(getTabPanel('z').hidden).toBeFalsy(), {timeout: 100});
    await waitFor(() => expect(queryCurrentTabKeyState('z')).toBeTruthy(), {timeout: 1});

    history.back();
    await waitFor(() => expect(getTabPanel('x').hidden).toBeFalsy(), {timeout: 100});
    await waitFor(() => expect(getTabPanel('z').hidden).toBeTruthy(), {timeout: 100});
    await waitFor(() => expect(queryCurrentTabKeyState('x')).toBeTruthy(), {timeout: 1});
  });

  test('overwriteDefault selects the given tab on init.', () => {
    render(<TestMain overwriteDefault="z" />);

    expect(getTabPanel('z').hidden).toBeFalsy();
    expect(getTabPanel('y').hidden).toBeTruthy();
    expect(queryCurrentTabKeyState('z')).toBeTruthy();
  });

  test('restores the persisted tab from sync on init.', () => {
    const history = createMemoryHistory({
      initialEntries: [{pathname: '/', state: {[TEST_SYNCHRONIZE_HISTORY_KEY]: 'z'}}],
    });

    render(<TestMain history={history} />);

    // sync.read() takes precedence over the factory default.
    expect(getTabPanel('z').hidden).toBeFalsy();
    expect(getTabPanel('y').hidden).toBeTruthy();
  });

  test('useTabState setter switches tab with a value and an updater function.', async () => {
    render(<TestMain />);

    expect(getTabPanel('y').hidden).toBeFalsy();

    // updater function form: y -> z
    await userEvent.click(screen.getByText('toggle y/z'));
    expect(getTabPanel('z').hidden).toBeFalsy();
    expect(getTabPanel('y').hidden).toBeTruthy();
    expect(queryCurrentTabKeyState('z')).toBeTruthy();

    // plain value form
    await userEvent.click(screen.getByText('switch to x'));
    expect(getTabPanel('x').hidden).toBeFalsy();
    expect(getTabPanel('z').hidden).toBeTruthy();
  });

  test('updater-function setter pushes the resolved key to sync, not the function.', async () => {
    const history = createMemoryHistory();

    render(<TestMain history={history} />);
    expect((history.location.state as any)[TEST_SYNCHRONIZE_HISTORY_KEY]).toBe('y');

    // y -> z through an updater function
    await userEvent.click(screen.getByText('toggle y/z'));

    expect((history.location.state as any)[TEST_SYNCHRONIZE_HISTORY_KEY]).toBe('z');
    expect(getTabPanel('z').hidden).toBeFalsy();
  });

  test('forceRemount unmounts the panel while it is not selected.', async () => {
    render(<TestMain forceRemount={['z']} />);

    // not selected + forceRemount => removed from the DOM (unlike a hidden panel)
    expect(queryTabPanel('z')).toBeNull();
    expect(getTabPanel('x').hidden).toBeTruthy();

    await userEvent.click(getTabNav('z'));
    expect(getTabPanel('z').hidden).toBeFalsy();

    await userEvent.click(getTabNav('x'));
    expect(queryTabPanel('z')).toBeNull();
  });
});
