const KEY = "ck_auto_listen";
/** 启动即自动监听，默认开启 */
export const getAutoListen = () => localStorage.getItem(KEY) !== "0";
export const setAutoListen = (on: boolean) => localStorage.setItem(KEY, on ? "1" : "0");

const MIC_KEY = "ck_teacher_mic";
/** 自动监听时同时打开老师的麦克风（语音提问），默认开启 */
export const getTeacherMic = () => localStorage.getItem(MIC_KEY) !== "0";
export const setTeacherMic = (on: boolean) => localStorage.setItem(MIC_KEY, on ? "1" : "0");
/** 启动时是否自动打开麦克风 */
export const shouldAutoMic = () => getAutoListen() && getTeacherMic();
