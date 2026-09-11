// 订单中心域文案（订单中心 P0+P2：会员单+皮肤单统一列表）。
// en 键集须与 zh deep-equal（parity.test.ts）。
export const orders = {
  title: '订单',
  // 类型筛选
  filterAll: '全部',
  filterMembership: '会员',
  filterSkin: '皮肤',
  // 状态（与 profile.order* 同义，此处为订单中心 pill 专用短文案）
  statusSuccess: '已生效',
  statusFailed: '失败',
  statusPending: '待支付',
  statusProcessing: '处理中',
  statusRefunded: '已退款',
  // 类型标签
  kindMembership: '会员订单',
  kindSkin: '皮肤订单',
  // 支付通道
  providerApple: 'App Store',
  providerGoogle: 'Google Play',
  providerHms: '华为应用内支付',
  providerStore: '商店',
  providerMock: '模拟支付',
  providerOther: '其他渠道',
  // 空态 / 门禁 / 部分失败
  empty: '暂无订单。',
  emptyCta: '去逛逛皮肤商店',
  signInRequired: '登录后查看订单。',
  signInCta: '登录',
  membershipSourceFailed: '会员订单暂时拉取不到，其余订单照常显示。',
  skinSourceFailed: '皮肤订单暂时拉取不到，其余订单照常显示。',
  retry: '重试',
  // 详情展开
  detailOrderId: '订单号',
  detailStoreProduct: '商品',
  detailEntitlement: '权益',
  detailEntitled: '已生效',
  detailNotEntitled: '未生效',
  detailCompletedAt: '完成时间',
  viewSkin: '查看皮肤',
} as const;
