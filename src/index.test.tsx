import React, {useEffect, useState} from 'react';

import {render, screen, waitFor} from '@testing-library/react';
//  because of a bug
//  eslint-disable-next-line testing-library/no-manual-cleanup
import {cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createMemoryHistory} from 'history';
import type {History} from 'history';
import {describe, expect, test, afterEach} from 'vitest';

import tabFactory from './';

afterEach(cleanup);

const TEST_SYNCHRONIZE_HISTORY_KEY = 'test-main';

type TestTabKey = 'x' | 'y' | 'z';

const {Tab, TabList, TabNav, TabPanel, useTabState} = tabFactory<TestTabKey>('y');

type Props = {lazy?: ReadonlyArray<TestTabKey>; history?: History};

function TabKeyWatcher() {
  const [key, _setKey] = useTabState();

  return <div>tab key is: {key}</div>;
}

function TabPage(props: Props) {
  const {lazy = []} = props;
  return (
    <React.StrictMode>
      <Tab synchronizeHistoryKey={TEST_SYNCHRONIZE_HISTORY_KEY} {...props}>
        <TabList>
          <TabNav tabKey="x">tab nav x</TabNav>
          <TabNav tabKey="y">tab nav y</TabNav>
          <TabNav tabKey="z">tab nav z</TabNav>
        </TabList>
        <TabKeyWatcher />
        <TabPanel tabKey="x" lazy={lazy.includes('x')}>
          tab content of x
        </TabPanel>
        <TabPanel tabKey="y" lazy={lazy.includes('y')}>
          tab content of y
        </TabPanel>
        <TabPanel tabKey="z" lazy={lazy.includes('z')}>
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
});
