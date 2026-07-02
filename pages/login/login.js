Page({
  data: {
    phone: '',
  },

  onLoad() {
    // 回显已绑定的手机号
    const phone = wx.getStorageSync('userPhone') || ''
    if (phone) {
      this.setData({ phone })
    }
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value })
  },

  // 绑定手机号：将手机号写入 users 集合（与 openid 关联）
  onBindPhone() {
    const phone = this.data.phone.trim()
    if (!phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' })
      return
    }
    if (phone.length !== 11 || !/^\d{11}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...', mask: true })

    // 保存到本地
    wx.setStorageSync('userPhone', phone)

    // 写入云数据库 users 集合（与 openid 关联）
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
              },
              success: () => {
                wx.hideLoading()
                wx.showToast({ title: '绑定成功', icon: 'success' })
                setTimeout(() => wx.navigateBack(), 1500)
              },
              fail: () => {
                wx.hideLoading()
                wx.showToast({ title: '保存失败，请重试', icon: 'none' })
              }
            })
          } else {
            wx.hideLoading()
            wx.showToast({ title: '用户不存在，请重试', icon: 'none' })
          }
        },
        fail: () => {
          wx.hideLoading()
          wx.showToast({ title: '保存失败，请重试', icon: 'none' })
        }
      })
    } else {
      wx.hideLoading()
      wx.showToast({ title: '请稍后重试', icon: 'none' })
    }
  },

})
