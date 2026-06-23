Page({
  data: {
    frequentList: [],       // 常用地址列表
  },

  onShow() {
    this.loadFrequent()
  },

  // 加载常用地址（本地 Storage）
  loadFrequent() {
    const list = wx.getStorageSync('frequentLocations') || []
    this.setData({ frequentList: list })
  },

  // ==========================================
  // 搜索地址 — 打开微信原生地图选点
  // ==========================================
  onSearchTap() {
    wx.chooseLocation({
      success: (res) => {
        // 校验：必须搜索并选中具体地址，不允许点默认的「确定」
        if (!res.name || res.name.trim().length === 0) {
          wx.showToast({ title: '请搜索并选择一个具体地址', icon: 'none' })
          return
        }
        const loc = {
          name: res.name.trim(),
          address: res.address || '',
          latitude: res.latitude,
          longitude: res.longitude
        }
        this.saveAndReturn(loc)
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选择失败，请重试', icon: 'none' })
        }
      }
    })
  },

  // ==========================================
  // 点常用地址 — 直接返回
  // ==========================================
  onFrequentTap(e) {
    const index = e.currentTarget.dataset.index
    const loc = this.data.frequentList[index]
    // 不需要再保存，但更新时间戳以排到最前面
    loc.useTime = Date.now()
    this.saveAndReturn(loc)
  },

  // ==========================================
  // 保存到常用地址 + 返回发布页
  // ==========================================
  saveAndReturn(loc) {
    // 保存到常用地址（去重 + 最多保留 10 条）
    let list = wx.getStorageSync('frequentLocations') || []

    // 去重：相同 name+address 的合并
    list = list.filter(item =>
      !(item.name === loc.name && item.address === loc.address)
    )

    // 加上时间戳，排前面
    loc.useTime = Date.now()
    list.unshift(loc)

    // 最多 10 条
    if (list.length > 10) list = list.slice(0, 10)

    wx.setStorageSync('frequentLocations', list)

    // 通过页面栈把数据传回上一页
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    if (prevPage) {
      prevPage.setData({
        locationName: loc.name,
        locationAddress: loc.address,
        latitude: loc.latitude,
        longitude: loc.longitude,
        locationText: loc.name
      })
    }
    wx.navigateBack()
  },

  // ==========================================
  // 删除某条常用地址
  // ==========================================
  onDeleteFrequent(e) {
    const index = e.currentTarget.dataset.index
    let list = this.data.frequentList
    list.splice(index, 1)
    wx.setStorageSync('frequentLocations', list)
    this.setData({ frequentList: list })
  },

})
