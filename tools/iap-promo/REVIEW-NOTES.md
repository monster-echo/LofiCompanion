# ASC IAP Review Notes（深夜工作台 $0.99 单买）

ASC → 商品 → Review Notes（App Review Information）可粘贴以下英文（中文备查）：

---

**EN（建议粘贴这段）**

This in-app purchase is a purely cosmetic companion skin ("Midnight Workstation" / 深夜工作台), a one-time non-consumable purchase ($0.99) that permanently unlocks an alternative visual theme for the study companion. It provides no functional advantage.

How to verify:
1. Sign in with the test account (see Test Account section of this submission).
2. On the home screen, tap the companion artwork to open the skin gallery, or go to the skin store ("更多皮肤商店").
3. Select "深夜工作台" (Midnight Workstation) — its card shows a $0.99 price badge.
4. On the detail page, tap "$0.99 永久解锁" (Unlock forever), then "确认支付" (Confirm) — the Apple payment sheet appears and the purchase completes via App Store IAP.
5. After purchase, the skin is applied from the same page ("已拥有 · 立即使用"). "恢复购买" (Restore Purchases) is available on the confirmation sheet.

The purchase is verified server-side; if verification is interrupted, the app automatically recovers the pending order on the next visit to the detail page.

---

**中文对照（仅内部备查）**

该内购为纯装饰性陪伴皮肤「深夜工作台」：$0.99 单买永久解锁，无任何功能优势。
验证路径：登录测试账号 → 首页点击陪伴画面进入皮肤画廊（或「更多皮肤商店」）→ 选深夜工作台 → 详情页点「¥6 永久解锁」→「确认支付」拉起 Apple 支付 → 购买完成后同页「已拥有 · 立即使用」可应用；确认面板内有「恢复购买」。购买由服务端验证；中断后下次进入详情页自动恢复订单。

---

## 交付物清单（tools/iap-promo/）

| 文件 | 用途 | 规格 |
|---|---|---|
| `midnight-workstation-1024.png` | IAP 宣传图（offer code / 商品页推广） | 1024×1024 PNG 不透明 |
| `midnight-workstation-review-1290x2796.png` | Review Information 的 Screenshot | 1290×2796 PNG（iPhone 6.9" 类） |
| `REVIEW-NOTES.md` | Review Notes 文案 | 本文件 |
| `midnight-workstation.html` / `-review.html` | 上两者的渲染源（改后用 Chrome headless 重出） | — |

## 提交前注意

- 审核 Screenshot 当前是按真实详情页 1:1 渲染的图（非真机截图）。若方便，真机走一遍购买页截图替换更稳妥（任何 iPhone，设置→开发者/Safari 截图即可）。
- 商品需随 App 版本一起「随此版本提交」才会生效。
- ~~提交前确认生产库 `skin_products`（midnight）已配 `store_product_ids` + `provider='store'`~~ ✅ 已配置并上线（2026-09-02，商店目录 API 返回 $0.99/USD/store/双端 SKU）。
- 商品 ID：`tech.zhongbei.loficompanion.theme.midnight`（ASC/Play 同名）；价格 $0.99 = Tier 1。
