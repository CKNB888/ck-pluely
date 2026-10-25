const KEY = "ck_auto_listen";
/** 启动即自动监听，默认开启 */
export const getAutoListen = () => localStorage.getItem(KEY) !== "0";
export const setAutoListen = (on: boolean) => localStorage.setItem(KEY, on ? "1" : "0");
