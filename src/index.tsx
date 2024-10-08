import type {ReactNode, SetStateAction} from 'react';
import React, {useEffect, memo, useRef, createContext, useContext, useState, useCallback} from 'react';

import {Action, type History} from 'history';

type BaseProps<Key extends string> = {
  tabKey: Key;
  /**
   * 選択時はCSS [attribute] Selectorを使い、 [aria-selected=true] で
   */
  className?: string;
  children: ReactNode;
};

type SetTabAction<Keys extends string> = (key: Keys | ((prev: Keys) => Keys)) => void;

type TabContext<Keys extends string> = {
  tabKey: Keys;
  setTabKey: SetTabAction<Keys>;
};

/**
 * withSelectorが正式化されるまで、useContextは強制的に内部の再レンダリングするのでContentを分離する
 */
const TabPanelContent = memo(function TabPanelContent(props: {
  isSelected: boolean;
  /**
   * ユーザーがタブを開くまで中のコンポーネントをレンダリングしない。
   * 以下のforceRemountと排他なので注意。
   */
  lazy?: undefined | boolean;
  /**
   * ユーザーがタブを閉じてから開くたびに中のコンポーネントをレンダリングしなおす。
   * これによって、同じpropsを渡していたとしてもuseEffectが毎回走る。
   */
  forceRemount?: undefined | boolean;
  className?: undefined | string;
  children: ReactNode;
}) {
  const {isSelected, lazy, forceRemount, className, children} = props;

  const isAppeardRef = useRef(false);
  useEffect(() => {
    if (isSelected) {
      isAppeardRef.current = true;
    }
  }, [isSelected]);

  if (isSelected === false) {
    if (forceRemount) {
      return null;
    }
    if (lazy === true && isAppeardRef.current === false) {
      return null;
    }
  }

  return (
    <div hidden={!isSelected} role="tabpanel" className={className}>
      {children}
    </div>
  );
});

type TabProps<Keys extends string, HistoryKey extends string | undefined = undefined> = {
  className?: string;
  overwriteDefault?: Keys;
  /**
   * History object to sync.
   */
  history?: History;
  /**
   * Key to store current tab key in history state.
   * You must use it with `history` props.
   */
  synchronizeHistoryKey?: HistoryKey;
  children: ReactNode;
};

function getLocStateIfExists<Keys>(loc: undefined | History['location'], key: string | undefined): undefined | Keys {
  if (key == null || loc?.state == null) {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  return (loc.state as any)[key];
}

/**
 * @typeParam Keys string literal types which can be tabKey
 * @param defaultTabKey default tab key should be selected.
 *
 * @example
 * ```typescript
 * const {Tab, TabNav, TabPanel} = tabFactory<'a' | 'b' | 'c'>('b');
 *
 * <Tab>
 *   <TabList>
 *     <TabNav tabKey="a">a</TabNav>
 *     <TabNav tabKey="b">b</TabNav>
 *     <TabNav tabKey="c">c</TabNav>
 *   </TabList>
 *
 *   <TabPanel tabKey="a">a panel dayo</TabPanel>
 *   <TabPanel tabKey="b">b panel dayo</TabPanel>
 *   <TabPanel tabKey="c">c panel dayo</TabPanel>
 * </Tab>
 * ```
 */
export default function tabFactory<Keys extends string>(defaultTabKey: Keys) {
  const TabContext = createContext<TabContext<Keys>>({tabKey: defaultTabKey, setTabKey: null as any});

  return {
    Tab<HistoryKey extends string>(this: void, props: TabProps<Keys, HistoryKey>) {
      const {className, overwriteDefault, history, synchronizeHistoryKey, children} = props;

      const [tabKey, setTabKey] = useState<Keys>(
        () => getLocStateIfExists(history?.location, synchronizeHistoryKey) ?? overwriteDefault ?? defaultTabKey,
      );

      const tabKeySetter: typeof setTabKey = useCallback(
        (k: SetStateAction<Keys>) => {
          let nextKey: Keys;
          setTabKey((prev) => {
            if (typeof k === 'function') {
              nextKey = k(prev);
            } else {
              nextKey = k;
            }
            return nextKey;
          });
          if (synchronizeHistoryKey && history) {
            history.push('', {[synchronizeHistoryKey]: k});
          }
        },
        [history, setTabKey, synchronizeHistoryKey],
      );

      const historyInitialized = useRef<string>();
      useEffect(() => {
        if (synchronizeHistoryKey == null || history == null) {
          return;
        }
        if (historyInitialized.current === synchronizeHistoryKey) {
          return;
        }
        historyInitialized.current = synchronizeHistoryKey;

        // 初期値投入
        history.replace('', {[synchronizeHistoryKey]: tabKey});
        const unsub = history.listen(({action, location}) => {
          if (action !== Action.Pop) {
            return;
          }

          const state: any = location.state;
          if (state != null && synchronizeHistoryKey in state) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            setTabKey(state[synchronizeHistoryKey] as Keys);
          }
        });
        return () => {
          historyInitialized.current = undefined;
          unsub();
        };
      }, [history, synchronizeHistoryKey, historyInitialized]);

      return (
        <TabContext.Provider value={{tabKey, setTabKey: tabKeySetter}}>
          <div className={className}>{children}</div>
        </TabContext.Provider>
      );
    },

    TabList(this: void, props: {className?: string; children: ReactNode}) {
      const {className, children} = props;
      return (
        <div role="tablist" className={className}>
          {children}
        </div>
      );
    },

    TabNav<Key extends Keys>(this: void, props: BaseProps<Key>) {
      const {tabKey, className, children} = props;
      const {tabKey: selected, setTabKey} = useContext(TabContext);
      if (selected === tabKey) {
        return (
          <button type="button" role="tab" aria-selected="true" className={className}>
            {children}
          </button>
        );
      }
      return (
        <button type="button" role="tab" aria-selected="false" className={className} onClick={() => setTabKey(tabKey)}>
          {children}
        </button>
      );
    },

    /** */
    TabPanel<Key extends Keys>(
      this: void,
      props: BaseProps<Key> & {
        /** If true, children will not be rendered until it's selected. */
        lazy?: boolean;
        forceRemount?: boolean;
      },
    ) {
      const {tabKey, className, lazy, forceRemount, children} = props;
      const {tabKey: selectedTabKey} = useContext(TabContext);
      const isSelected = selectedTabKey === tabKey;
      return (
        <TabPanelContent isSelected={isSelected} className={className} lazy={lazy} forceRemount={forceRemount}>
          {children}
        </TabPanelContent>
      );
    },
    /**
     * FIXME: Contextを利用しているので <Tab /> を宣言した下階層でしか使えない……
     * @returns
     */
    useTabState(this: void): [tabKey: Keys, setTabKey: SetTabAction<Keys>] {
      const {tabKey, setTabKey} = useContext(TabContext);
      return [tabKey, setTabKey];
    },
  };
}
