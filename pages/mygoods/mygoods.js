Page({
  data: {
    myGoods: [],
    loading: false
  },

  onShow() {
    this.loadMyGoods()
  },

  // 从云数据库加载"我的商品"
  loadMyGoods() {
    this.setData({ loading: true })
    wx.cloud.callFunction({
      name: 'goods',
      data: { action: 'myList' },
      success: (res) => {
        if (res.result.code === 0) {
          this.setData({ myGoods: res.result.list, loading: false })
        } else {
          wx.showToast({ title: '加载失败', icon: 'none' })
          this.setData({ loading: false })
        }
      },
      fail: () => {
        this.setData({ loading: false })
      }
    })
  },

  onGoodsTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    })
  },

  // 上架 / 下架切换（通过云函数）
  onToggleStatus(e) {
    const { id } = e.currentTarget.dataset
    wx.showModal({
      title: '提示',
      content: '确定要切换该商品的上下架状态吗？',
      success: (modalRes) => {
        if (!modalRes.confirm) return

        wx.showLoading({ title: '操作中...' })
        wx.cloud.callFunction({
          name: 'goods',
          data: {
            action: 'toggleStatus',
            data: { goodsId: id }
          },
          success: (res) => {
            wx.hideLoading()
            if (res.result.code === 0) {
              wx.showToast({ title: res.result.msg, icon: 'success' })
              this.loadMyGoods()  // 刷新列表
            } else {
              wx.showToast({ title: res.result.msg || '操作失败', icon: 'none' })
            }
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: '操作失败', icon: 'none' })
          }
        })
      }
    })
  },

  // 跳转编辑页（publish 是 tabBar 页面，navigateTo 无效，用 reLaunch 传递参数）
  onEdit(e) {
    const id = e.currentTarget.dataset.id
    wx.reLaunch({
      url: `/pages/publish/publish?editId=${id}`
    })
  },

  // 删除商品（通过云函数）
  onDelete(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这件商品吗？',
      confirmColor: '#ff4444',
      success: (modalRes) => {
        if (!modalRes.confirm) return

        wx.showLoading({ title: '删除中...' })
        wx.cloud.callFunction({
          name: 'goods',
          data: {
            action: 'delete',
            data: { goodsId: id }
          },
          success: (res) => {
            wx.hideLoading()
            if (res.result.code === 0) {
              wx.showToast({ title: '已删除', icon: 'success' })
              this.loadMyGoods()
            } else {
              wx.showToast({ title: res.result.msg || '删除失败', icon: 'none' })
            }
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        })
      }
    })
  },

})
