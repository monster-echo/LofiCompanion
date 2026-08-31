# features

`mobileui feature add <id>` 生成的业务模块所有权边界落在这里
（domain / application / data / presentation 四层 + 各自 README）。

依赖方向：`presentation -> application -> domain`；data 适配器实现 domain 契约。
业务代码按已批准的 spec 实现，不生成占位行为。
