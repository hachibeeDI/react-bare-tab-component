import type {ReactNode, SetStateAction} from 'react';
import React, {useEffect, memo, useRef, createContext, useContext, useState, useCallback} from 'react';

/**
 * 現在のタブキーを外部ストア(history, URL, localStorage 等)と同期するための注入インターフェース。
 * これを実装したオブジェクトを `Tab` の `sync` prop に渡す。
 */
export type TabStateSync<Keys extends string> = {
  /** 永続化されたタブキーを読む。初期値の決定に使う。 */
  read(): Keys | undefined;
  /** ユーザー操作によるタブ変更を新規エントリとして永続化する(history.push 相当)。 */
  push(key: Keys): void;
  /** 初期タブキーを新規エントリを作らずに記録する(history.replace 相当)。 */
  replace(key: Keys): void;
  /** 外部起因の変更(戻る/進む等)を購読する。unsubscribe を返す。 */
  subscribe(onChange: (key: Keys) => void): () => void;
};

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

type TabProps<Keys extends string> = {
  className?: string;
  overwriteDefault?: Keys | undefined;
  /**
   * 現在のタブキーを外部ストアと同期するためのアダプタ。
   * 省略時は同期しない。
   */
  sync?: TabStateSync<Keys> | undefined;
  children: ReactNode;
};

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
    Tab(this: void, props: TabProps<Keys>) {
      const {className, overwriteDefault, sync, children} = props;

      const [tabKey, setTabKey] = useState<Keys>(() => sync?.read() ?? overwriteDefault ?? defaultTabKey);

      // 関数形式の更新を stale な値で解決しないよう、最新値を ref で保持する。
      const tabKeyRef = useRef(tabKey);
      tabKeyRef.current = tabKey;
      const tabKeySetter: SetTabAction<Keys> = useCallback(
        (k: SetStateAction<Keys>) => {
          const nextKey = typeof k === 'function' ? k(tabKeyRef.current) : k;
          setTabKey(nextKey);
          sync?.push(nextKey);
        },
        [sync],
      );

      const initialized = useRef(false);
      useEffect(() => {
        if (sync == null) {
          return;
        }
        if (initialized.current) {
          return;
        }
        initialized.current = true;

        // 初期値投入
        sync.replace(tabKey);
        const unsub = sync.subscribe((key) => setTabKey(key));
        return () => {
          initialized.current = false;
          unsub();
        };
      }, [sync]);

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
