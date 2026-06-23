const { calcDistance, formatDistance } = require('../../utils/location.js')

Page({
  data: {
    searchKey: '',
    activeCategory: 0,
    categories: [
      { id: 0, name: '全部' },
      { id: 1, name: '家电' },
      { id: 2, name: '家具' },
      { id: 3, name: '服装' },
      { id: 4, name: '书籍' },
      { id: 5, name: '玩具' },
      { id: 6, name: '其他' },
    ],
    goodsList: [],
    allGoods: [],
    loading: false,
  },

  onShow() {
    this.loadGoods()
  },

  // ==========================================
  // 从云数据库加载商品列表
  // ==========================================
  async loadGoods() {
    this.setData({ loading: true })

    try {
      // 1. 调云函数拉商品列表
      const res = await wx.cloud.callFunction({
        name: 'goods',
        data: {
          action: 'list',
          data: {
            searchKey: this.data.searchKey,
            category: this.data.activeCategory,
            includeMine: true   // 开发阶段自己也能看到；上线后改为 false 或删掉
          }
        }
      })

      if (res.result.code !== 0) {
        wx.showToast({ title: '加载失败', icon: 'none' })
        this.setData({ loading: false })
        return
      }

      let goodsList = res.result.list

      // 2. 批量转云文件 ID → 临时 URL（解决图片加载慢）
      goodsList = await this.convertImageUrls(goodsList)

      // 3. 计算距离
      try {
        const locRes = await wx.getLocation({ type: 'gcj02' })
        const { latitude, longitude } = locRes
        goodsList = goodsList.map(item => {
          if (item.latitude && item.longitude) {
            const meters = calcDistance(latitude, longitude, item.latitude, item.longitude)
            return { ...item, distance: formatDistance(meters) }
          }
          return { ...item, distance: '未知' }
        })
      } catch (e) {
        goodsList = goodsList.map(item => ({ ...item, distance: '--' }))
      }

      this.setData({ goodsList, allGoods: goodsList, loading: false })

    } catch (err) {
      console.error('加载商品失败:', err)
      this.setData({ loading: false })
    }
  },

  // ==========================================
  // 把 cloud:// 格式的图片 ID 转成临时链接
  // ==========================================
  async convertImageUrls(goodsList) {
    // 收集所有需要转换的云文件 ID
    const fileIDs = new Set()
    goodsList.forEach(g => {
      if (g.image && g.image.startsWith('cloud://')) {
        fileIDs.add(g.image)
      }
      ;(g.cloudImageIds || []).forEach(id => {
        if (id && id.startsWith('cloud://')) {
          fileIDs.add(id)
        }
      })
    })

    if (fileIDs.size === 0) return goodsList

    try {
      const tempRes = await wx.cloud.getTempFileURL({
        fileList: [...fileIDs].slice(0, 50)  // 单次最多 50 个
      })
      // 建立 fileID → tempURL 映射
      const urlMap = {}
      tempRes.fileList.forEach(f => {
        if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL
      })
      // 替换
      return goodsList.map(g => ({
        ...g,
        image: urlMap[g.image] || g.image,
        cloudImageIds: (g.cloudImageIds || []).map(id => urlMap[id] || id)
      }))
    } catch (e) {
      console.error('图片链接转换失败:', e)
      return goodsList  // 转换失败就用原始 cloud:// 链接兜底
    }
  },

  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value })
  },

  onSearch() {
    this.loadGoods()
  },

  onCategoryTap(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ activeCategory: id }, () => {
      this.loadGoods()
    })
  },

  onPullDownRefresh() {
    this.loadGoods()
    setTimeout(() => wx.stopPullDownRefresh(), 1000)
  },

  onGoodsTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    })
  },

})
