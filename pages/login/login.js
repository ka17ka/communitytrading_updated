Page({
  data: {
    phone: '',
    code: '',
    logging: false
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value })
  },

  onCodeInput(e) {
    this.setData({ code: e.detail.value })
  },

  // 发送验证码（模拟）
  sendCode() {
    const phone = this.data.phone
    if (phone.length !== 11) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }
    wx.showToast({ title: '验证码已发送', icon: 'success' })
  },

  // ==========================================
  // 登录：保存手机号 + 触发云登录
  // ==========================================
  onLogin() {
    const { phone, code } = this.data
    if (!phone || !code) {
      wx.showToast({ title: '请填写手机号和验证码', icon: 'none' })
      return
    }
    if (phone.length !== 11) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }

    this.setData({ logging: true })

    // 保存手机号
    wx.setStorageSync('isLogin', true)
    wx.setStorageSync('userPhone', phone)

    // 将手机号写入 users 集合（与 openid 关联）
    const openid = getApp().globalData.openid
    if (openid) {
      const db = wx.cloud.database()
      db.collection('users').where({ openid }).get({
        success: (res) => {
          if (res.data.length > 0) {
            db.collection('users').doc(res.data[0]._id).update({
              data: {
                phone,
                updateTime: db.serverDate()
              }
            })
          }
        }
      })
    }

    // 跳转到首页
    wx.reLaunch({
      url: '/pages/home/home'
    })
  },

})
