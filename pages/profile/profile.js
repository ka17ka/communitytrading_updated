Page({
  data: {
    userInfo: {
      nickName: '',
      phone: '',
      avatarUrl: ''
    },
    myGoods: [],
    avatarFailed: false
  },

  onLoad() {
    this.setData({ avatarFailed: false })
    this.loadUserProfile()
    this.loadMyGoods()
  },

  onShow() {
    this.setData({ avatarFailed: false })
    this.loadUserProfile()
    this.loadMyGoods()
  },

  // ==========================================
  // 从云数据库加载用户信息
  // ==========================================
  loadUserProfile() {
    // 优先用 login CF 已返回的数据（app.js globalData）
    const profile = getApp().globalData.userProfile
    if (profile && profile.nickName) {
      this.setData({
        userInfo: {
          nickName: profile.nickName,
          phone: profile.phone || '',
          avatarUrl: profile.avatarUrl || ''
        }
      })
      return
    }

    // 兜底：直接查数据库
    const openid = getApp().globalData.openid
    if (!openid) {
      setTimeout(() => this.loadUserProfile(), 500)
      return
    }

    const db = wx.cloud.database()
    db.collection('users').where({ openid }).get({
      success: (res) => {
        if (res.data.length > 0) {
          const user = res.data[0]
          this.setData({
            userInfo: {
              nickName: user.nickName || '用户',
              phone: user.phone || '',
              avatarUrl: user.avatarUrl || ''
            }
          })
        }
      },
      fail: (err) => {
        console.error('加载用户信息失败:', err)
      }
    })
  },

  // ==========================================
  // 从云数据库加载"我的商品"数量
  // ==========================================
  loadMyGoods() {
    wx.cloud.callFunction({
      name: 'goods',
      data: { action: 'myList' },
      success: (res) => {
        if (res.result.code === 0) {
          this.setData({ myGoods: res.result.list })
        }
      }
    })
  },

  onNickNameInput(e) {
    this.setData({
      'userInfo.nickName': e.detail.value
    })
  },

  // ==========================================
  // 保存用户信息到云数据库
  // ==========================================
  onSave() {
    const { nickName } = this.data.userInfo
    if (!nickName || !nickName.trim()) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' })
      return
    }

    const openid = getApp().globalData.openid
    if (!openid) {
      wx.showToast({ title: '请稍后重试', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })
    const db = wx.cloud.database()
    db.collection('users').where({ openid }).get({
      success: (res) => {
        if (res.data.length > 0) {
          db.collection('users').doc(res.data[0]._id).update({
            data: {
              nickName: nickName.trim(),
              updateTime: db.serverDate()
            },
            success: () => {
              wx.hideLoading()
              wx.showToast({ title: '保存成功', icon: 'success' })
            },
            fail: () => {
              wx.hideLoading()
              wx.showToast({ title: '保存失败', icon: 'none' })
            }
          })
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    })
  },

  onGoodsTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    })
  },

  onMyGoods() {
    wx.navigateTo({
      url: '/pages/mygoods/mygoods'
    })
  },

  // 头像加载失败 → 切到 🐱
  onAvatarError() {
    this.setData({ avatarFailed: true })
  },

  onEditProfile() {
    wx.navigateTo({
      url: '/pages/editprofile/editprofile'
    })
  },

  // 退出登录 → 清除本地缓存
  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出吗？将清除本地缓存数据。',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('isLogin')
          wx.removeStorageSync('userPhone')
          wx.removeStorageSync('nickName')
          wx.removeStorageSync('avatarUrl')
          wx.reLaunch({
            url: '/pages/home/home'
          })
        }
      }
    })
  },

})
