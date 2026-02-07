import {useCookie, useState, watch} from '#imports';

export default function useStatefulCookie(name: string) {
  const cfg = useRuntimeConfig()
  const cookie = useCookie(name, {
    maxAge: 60 * 60 * 24 * 7 * 30
  });
  const state = useState(name, () => cookie.value);

  watch(state, () => {
    cookie.value = state.value;
  }, {deep: true});

  return state;
}
