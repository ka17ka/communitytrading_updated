Page({
  data: {
    messages: [],
    inputVal: '',
    scrollIntoView: '',
    goodsId: '',
    goodsName: '',
    toOpenid: '',        // 对方的 openid
    sellerName: '',
    loading: false
  },

  onLoad(options) {
    const { goodsId, goodsName, toOpenid, sellerName } = options
    this.setData({ goodsId, goodsName, toOpenid, sellerName })

    // 设置导航栏标题
    wx.setNavigationBarTitle({ title: sellerName || '聊天' })

    // 首次加载消息
    this.loadMessages()
  },

  // ==========================================
  // 从云数据库加载聊天记录
  // ==========================================
  loadMessages() {
    const { goodsId, toOpenid } = this.data
    if (!goodsId || !toOpenid) return

    this.setData({ loading: true })
    wx.cloud.callFunction({
      name: 'chat',
      data: {
        action: 'getMessages',
        data: { goodsId, toOpenid }
      },
      success: (res) => {
        if (res.result.code === 0) {
          const messages = res.result.list
          this.setData({
            messages,
            loading: false,
            scrollIntoView: messages.length > 0 ? `msg-${messages[messages.length - 1]._id}` : ''
          })
          // 消息已标记为已读，刷新 tab 红点
          this.updateTabBadge()
        } else {
          this.setData({ loading: false })
        }
      },
      fail: () => {
        this.setData({ loading: false })
      }
    })
  },

  // 更新底部 tab 未读红点
  updateTabBadge() {
    wx.cloud.callFunction({
      name: 'chat',
      data: { action: 'getUnreadCount' },
      success: (res) => {
        if (res.result && res.result.code === 0) {
          const count = res.result.count || 0
          if (count > 0) {
            wx.setTabBarBadge({ index: 2, text: String(count > 99 ? '99+' : count) })
          } else {
            wx.removeTabBarBadge({ index: 2 })
          }
        }
      }
    })
  },

  // 定时刷新消息（每 3 秒拉一次）
  startPolling() {
    this.pollTimer = setInterval(() => {
      this.loadMessages()
    }, 3000)
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  },

  onShow() {
    this.startPolling()
  },

  onHide() {
    this.stopPolling()
  },

  onUnload() {
    this.stopPolling()
  },

  onInput(e) {
    this.setData({ inputVal: e.detail.value })
  },

  // ==========================================
  // 发送消息
  // ==========================================
  onSend() {
    const { inputVal, messages, goodsId, goodsName, toOpenid } = this.data
    if (!inputVal.trim()) return

    // 先在前端显示（乐观更新）
    const tempMsg = {
      _id: `temp_${Date.now()}`,
      type: 'text',
      content: inputVal.trim(),
      isSelf: true,
      createTime: new Date()
    }
    this.setData({
      messages: [...messages, tempMsg],
      inputVal: '',
      scrollIntoView: `msg-${tempMsg._id}`
    })

    // 调用云函数发送
    wx.cloud.callFunction({
      name: 'chat',
      data: {
        action: 'send',
        data: {
          goodsId,
          goodsName,
          toOpenid,
          content: tempMsg.content,
          type: 'text'
        }
      },
      success: () => {
        // 发送成功后刷新消息（拿到真实的 _id）
        this.loadMessages()
      },
      fail: (err) => {
        console.error('发送失败:', err)
        wx.showToast({ title: '发送失败', icon: 'none' })
      }
    })
  },

  // ==========================================
  // 发送图片
  // ==========================================
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        const { goodsId, goodsName, toOpenid } = this.data

        wx.showLoading({ title: '发送中...' })

        // 1. 上传图片到云存储
        const cloudPath = `chat/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
        wx.cloud.uploadFile({
          cloudPath,
          filePath: tempPath,
          success: (uploadRes) => {
            // 2. 发送图片消息
            wx.cloud.callFunction({
              name: 'chat',
              data: {
                action: 'send',
                data: {
                  goodsId,
                  goodsName,
                  toOpenid,
                  content: uploadRes.fileID,
                  type: 'image'
                }
              },
              success: () => {
                wx.hideLoading()
                this.loadMessages()
              },
              fail: () => {
                wx.hideLoading()
                wx.showToast({ title: '发送失败', icon: 'none' })
              }
            })
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: '上传失败', icon: 'none' })
          }
        })
      }
    })
  },

})
