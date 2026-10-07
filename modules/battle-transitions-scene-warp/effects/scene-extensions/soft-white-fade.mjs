export function register({ sceneWarp }) {
  sceneWarp?.registerTransition("soft-white-fade", {
    label: "柔白淡入淡出",
    description: "内置场景转场示例；第三方模组可通过公开效果包 API 注册同类效果。",
    createClientEffect: ({ overlay }) => ({
      attach() {},
      setProgress(progress) {
        const value = Math.max(0, Math.min(1, Number(progress) || 0));
        overlay.root.style.setProperty("--swt-blackout", String(value * 0.94));
        overlay.root.style.setProperty("--swt-veil", "0");
        overlay.root.style.background = `rgb(255 255 255 / ${value * 0.94})`;
      },
      destroy() {
        overlay.root.style.background = "";
      }
    })
  }, {
    owner: "battle-transitions",
    packId: "battle-transitions.builtin",
    replace: true
  });
}
