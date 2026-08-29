/**
 * 本地持久化唯一接口（P0-A Task 6）。AsyncStorage 的静态方法在结构上满足
 * 该接口——应用层直接传入 `AsyncStorage`；node 测试传 in-memory Map 实现。
 * data 层因此不 import react-native，可独立测试。
 */
export interface StorageDriver {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
