Page({
  data: {
    goods: null,
    isMine: false,
    loading: true,
    avatarFailed: false
  },

  onLoad(options) {
    const goodsId = options.id  // 这里的 id 是云数据库的 _id
    if (!goodsId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      this.setData({ loading: false })
      return
    }

    this.setData({ loading: true, avatarFailed: false })
    wx.cloud.callFunction({
      name: 'goods',
      data: {
        action: 'detail',
        data: { goodsId }
      },
      success: (res) => {
        if (res.result.code === 0 && res.result.goods) {
          this.setData({
            goods: res.result.goods,
            isMine: res.result.goods.isMine || false,
            loading: false
          })
        } else {
          wx.showToast({ title: res.result.msg || '商品不存在', icon: 'none' })
          this.setData({ loading: false })
        }
      },
      fail: (err) => {
        console.error('获取商品详情失败:', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
        this.setData({ loading: false })
      }
    })
  },

  // 联系卖家 → 进入聊天
  onChat() {
    const { goods } = this.data
    if (!goods) return
    wx.navigateTo({
      url: `/pages/chat/chat?goodsId=${goods._id}&goodsName=${goods.name || ''}&toOpenid=${goods.openid || ''}&sellerName=${goods.nickName || '用户'}`
    })
  },

  // 导航到商品位置
  onNavigate() {
    const { goods } = this.data
    if (!goods || goods.latitude == null || goods.longitude == null) {
      wx.showToast({ title: '无位置信息', icon: 'none' })
      return
    }
    wx.openLocation({
      latitude: goods.latitude,
      longitude: goods.longitude,
      name: goods.name || '商品位置',
      address: goods.desc || '商品所在位置',
      scale: 16
    })
  },

  // 头像加载失败 → 切到 🐱
  onAvatarError() {
    this.setData({ avatarFailed: true })
  },

  // 编辑商品（仅自己的商品显示）
  onEdit() {
    const { goods } = this.data
    if (!goods) return
    wx.reLaunch({
      url: `/pages/publish/publish?editId=${goods._id}`
    })
  },

})
