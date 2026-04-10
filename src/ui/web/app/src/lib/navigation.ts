import { useRouter, type Router } from 'vue-router';

import { useUiI18n } from './i18n';

export function useLocalizedNavigation(): {
  pushPath: (path: string) => ReturnType<Router['push']>;
  replacePath: (path: string) => ReturnType<Router['replace']>;
} {
  const router = useRouter();
  const { withLocalePath } = useUiI18n();

  function pushPath(path: string): ReturnType<Router['push']> {
    return router.push(withLocalePath(path));
  }

  function replacePath(path: string): ReturnType<Router['replace']> {
    return router.replace(withLocalePath(path));
  }

  return {
    pushPath,
    replacePath,
  };
}
