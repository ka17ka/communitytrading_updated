Page({
  data: {
    messages: [],
    inputVal: '',
    scrollIntoView: '',
    goodsId: '',
    goodsName: '',
    toOpenid: '',        // 对方的 openid
    sellerName: '',
    loading: false,

    // 交换联系方式
    swapStatus: 'none',   // none | pending | agreed | rejected
    swapIsRequester: false,
    otherPhone: '',
    myPhone: '',
    swapLoading: false
  },

  onLoad(options) {
    const { goodsId, goodsName, toOpenid, sellerName } = options
    this.setData({ goodsId, goodsName, toOpenid, sellerName })

    // 设置导航栏标题
    wx.setNavigationBarTitle({ title: sellerName || '聊天' })

    // 首次加载消息 + 交换状态
    this.loadMessages()
    this.loadSwapStatus()
  },

  onShow() {
    this.startPolling()
    this.loadSwapStatus()
  },

  onHide() {
    this.stopPolling()
  },

  onUnload() {
    this.stopPolling()
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

  // ==========================================
  // 查询交换联系方式状态
  // ==========================================
  loadSwapStatus() {
    const { goodsId, toOpenid } = this.data
    if (!goodsId || !toOpenid) return

    wx.cloud.callFunction({
      name: 'chat',
      data: {
        action: 'getSwapStatus',
        data: { goodsId, toOpenid }
      },
      success: (res) => {
        if (res.result.code === 0) {
          this.setData({
            swapStatus: res.result.status,
            swapIsRequester: res.result.isRequester || false,
            otherPhone: res.result.otherPhone || '',
            myPhone: res.result.myPhone || ''
          })
        }
      }
    })
  },

  // ==========================================
  // 发起交换联系方式
  // ==========================================
  onSwapContact() {
    const { goodsId, goodsName, toOpenid, swapLoading } = this.data
    if (swapLoading) return

    this.setData({ swapLoading: true })
    wx.cloud.callFunction({
      name: 'chat',
      data: {
        action: 'swapContact',
        data: { goodsId, goodsName, toOpenid }
      },
      success: (res) => {
        this.setData({ swapLoading: false })
        if (res.result.code === 0) {
          wx.showToast({ title: '请求已发送', icon: 'success' })
          this.loadSwapStatus()
          this.loadMessages()  // 刷新消息，看到系统提示
        } else {
          wx.showToast({ title: res.result.msg, icon: 'none' })
        }
      },
      fail: () => {
        this.setData({ swapLoading: false })
        wx.showToast({ title: '请求失败，请重试', icon: 'none' })
      }
    })
  },

  // ==========================================
  // 回应交换请求（同意 / 拒绝）
  // ==========================================
  onRespondSwap(e) {
    // data-* 传值为字符串，需转为布尔
    const agree = e.currentTarget.dataset.agree === 'true'
    const { goodsId, toOpenid } = this.data

    wx.showLoading({ title: '处理中...', mask: true })
    wx.cloud.callFunction({
      name: 'chat',
      data: {
        action: 'respondSwap',
        data: { goodsId, fromOpenid: toOpenid, agree }
      },
      success: (res) => {
        wx.hideLoading()
        if (res.result.code === 0) {
          if (agree) {
            // 直接更新 UI，显示对方手机号
            this.setData({
              swapStatus: 'agreed',
              otherPhone: res.result.otherPhone || ''
            })
          } else {
            this.setData({ swapStatus: 'rejected' })
          }
          this.loadMessages()  // 刷新消息，看到系统提示
        } else {
          wx.showToast({ title: res.result.msg || '操作失败', icon: 'none' })
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '操作失败，请重试', icon: 'none' })
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

  // 定时刷新消息 + 交换状态（每 3 秒拉一次）
  startPolling() {
    this.pollTimer = setInterval(() => {
      this.loadMessages()
      this.loadSwapStatus()
    }, 3000)
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
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

    const content = inputVal.trim()

    // 先在前端显示（乐观更新）
    const tempId = `temp_${Date.now()}`
    const tempMsg = {
      _id: tempId,
      type: 'text',
      content,
      isSelf: true,
      createTime: new Date()
    }
    this.setData({
      messages: [...messages, tempMsg],
      inputVal: '',
      scrollIntoView: `msg-${tempId}`
    })

    // 调用云函数发送
    wx.cloud.callFunction({
      name: 'chat',
      data: {
        action: 'send',
        data: { goodsId, goodsName, toOpenid, content, type: 'text' }
      },
      success: (res) => {
        if (res.result && res.result.code !== 0) {
          // 安全检测不通过，移除乐观消息
          const filtered = this.data.messages.filter(m => m._id !== tempId)
          this.setData({ messages: filtered })
          wx.showToast({ title: res.result.msg || '发送失败', icon: 'none' })
        } else {
          this.loadMessages()
        }
      },
      fail: (err) => {
        console.error('发送失败:', err)
        // 发送失败，移除乐观消息
        const filtered = this.data.messages.filter(m => m._id !== tempId)
        this.setData({ messages: filtered })
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
              success: (sendRes) => {
                wx.hideLoading()
                if (sendRes.result && sendRes.result.code !== 0) {
                  wx.showToast({ title: sendRes.result.msg || '发送失败', icon: 'none' })
                } else {
                  this.loadMessages()
                }
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
