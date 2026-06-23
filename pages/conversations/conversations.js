Page({
  data: {
    conversations: [],
    loading: false
  },

  onShow() {
    this.loadConversations()
  },

  loadConversations() {
    this.setData({ loading: true })
    wx.cloud.callFunction({
      name: 'chat',
      data: { action: 'getConversations' },
      success: (res) => {
        if (res.result.code === 0) {
          const list = (res.result.list || []).map(c => ({
            ...c,
            lastTime: formatTime(c.lastTime)
          }))
          const total = res.result.totalUnread || 0
          this.setData({ conversations: list, loading: false })
          // 更新 tab 红点
          if (total > 0) {
            wx.setTabBarBadge({ index: 2, text: String(total > 99 ? '99+' : total) })
          } else {
            wx.removeTabBarBadge({ index: 2 })
          }
        } else {
          this.setData({ loading: false })
        }
      },
      fail: () => {
        this.setData({ loading: false })
      }
    })
  },

  // 点击进入聊天
  onConvTap(e) {
    const { goodsId, otherOpenid, nickName } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/chat/chat?goodsId=${goodsId}&toOpenid=${otherOpenid}&sellerName=${nickName || '用户'}`
    })
  },

})

function formatTime(str) {
  if (!str) return ''
  const d = new Date(str)
  const now = new Date()
  const diff = now - d
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min}分钟前`
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today - 86400000)
  if (d >= today) {
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }
  if (d >= yesterday) return '昨天'
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  if (d.getFullYear() === now.getFullYear()) return `${mo}-${day}`
  return `${d.getFullYear()}-${mo}-${day}`
}
