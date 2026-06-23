// app.js
App({
  onShow() {
    this.refreshUnreadBadge()
  },

  onHide() {
    if (this._watcher) {
      this._watcher.close()
      this._watcher = null
    }
  },

  onLaunch() {
    // ==========================================
    // 1. 初始化云开发
    // ==========================================
    wx.cloud.init({
      env: 'cloud1-d5gijysg1364117e9',
      traceUser: true
    })

    // ==========================================
    // 2. 微信登录 —— 获取 openid + 用户信息
    // ==========================================
    wx.login({
      success: res => {
        if (res.code) {
          wx.cloud.callFunction({
            name: 'login',
            success: loginRes => {
              const { openid, userProfile } = loginRes.result
              console.log('登录成功，openid:', openid)

              // 存到全局，任何页面都能用
              this.globalData.openid = openid
              this.globalData.userProfile = userProfile

              // 检查是否已登录过（有手机号就是老用户）
              if (userProfile && userProfile.phone) {
                wx.setStorageSync('isLogin', true)
                wx.setStorageSync('userPhone', userProfile.phone)
              }
            },
            fail: err => {
              console.error('登录云函数调用失败:', err)
            }
          })
        } else {
          console.error('wx.login 失败:', res.errMsg)
        }
      }
    })

    // ==========================================
    // 3. 实时监听新消息 → 更新 tab 红点
    // ==========================================
    this.watchMessages()

    // ==========================================
    // 4. 日志存储
    // ==========================================
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)
  },

  watchMessages() {
    const db = wx.cloud.database()
    this._watcher = db.collection('messages').watch({
      onChange: () => {
        wx.cloud.callFunction({
          name: 'chat',
          data: { action: 'getUnreadCount' },
          success: (res) => {
            if (res.result && res.result.code === 0) {
              const count = res.result.count || 0
              if (count > 0) {
                wx.setTabBarBadge({ index: 2, text: String(count > 99 ? '99+' : count) })
              }
              // 不清零，由进入聊天详情时手动清除
            }
          }
        })
      },
      onError: (err) => {
        console.error('消息监听失败:', err)
      }
    })
  },

  globalData: {
    userInfo: null,
    openid: null,
    userProfile: null
  }
})
