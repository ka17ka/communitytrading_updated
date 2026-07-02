Page({
  data: {
    nickName: '',
    phone: '',
    avatarUrl: ''
  },

  onLoad() {
    const profile = getApp().globalData.userProfile
    if (profile) {
      this.setData({
        nickName: profile.nickName || '',
        phone: profile.phone || '',
        avatarUrl: profile.avatarUrl || ''
      })
    }
  },

  onNickNameInput(e) {
    this.setData({ nickName: e.detail.value })
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value })
  },

  // 选择头像
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    this.setData({ avatarUrl })
  },

  // 保存：上传头像到云存储 → 通过 login 云函数写入数据库
  async onSave() {
    const { nickName, avatarUrl, phone } = this.data
    if (!nickName.trim()) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...', mask: true })

    let finalAvatarUrl = avatarUrl || ''
    // 如果是本地临时路径，先上传到云存储
    if (avatarUrl && !avatarUrl.startsWith('cloud://')) {
      try {
        const cloudPath = `avatars/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`
        const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: avatarUrl })
        finalAvatarUrl = uploadRes.fileID
      } catch (e) {
        console.error('头像上传失败:', e)
        wx.hideLoading()
        wx.showToast({ title: '头像上传失败', icon: 'none' })
        return
      }
    }

    wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'updateProfile',
        data: {
          nickName: nickName.trim(),
          avatarUrl: finalAvatarUrl,
          phone: (phone || '').trim()
        }
      },
      success: (res) => {
        wx.hideLoading()
        if (res.result.code === 0) {
          // 更新 globalData 和本地缓存
          const profile = getApp().globalData.userProfile
          if (profile) {
            profile.nickName = nickName.trim()
            profile.avatarUrl = finalAvatarUrl
            profile.phone = (phone || '').trim()
          }
          if ((phone || '').trim()) {
            wx.setStorageSync('userPhone', phone.trim())
          }
          wx.showToast({ title: '保存成功', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 1500)
        } else {
          wx.showToast({ title: res.result.msg || '保存失败', icon: 'none' })
        }
      },
      fail: (err) => {
        console.error('保存失败:', err)
        wx.hideLoading()
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    })
  },

})
