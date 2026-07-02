Page({
  data: {
    isEditMode: false,
    editId: null,
    images: [],           // 图片本地临时路径（预览用）
    cloudImageIds: [],    // 上传到云存储后的 fileID 列表（编辑回显用）
    name: '',
    desc: '',
    price: '',
    activeCategory: 0,
    locationName: '',       // 小区名 / 地点名
    locationAddress: '',    // 详细地址
    locationText: '点击选择商品所在位置',
    latitude: 0,
    longitude: 0,
    categories: [
      { id: 1, name: '家电' },
      { id: 2, name: '家具' },
      { id: 3, name: '服装' },
      { id: 4, name: '书籍' },
      { id: 5, name: '玩具' },
      { id: 6, name: '其他' },
    ],
    submitting: false,    // 防止重复提交
  },

  onLoad(options) {
    if (options.editId) {
      const editId = options.editId
      // 编辑模式：从云数据库获取商品详情回显
      wx.showLoading({ title: '加载中...' })
      wx.cloud.callFunction({
        name: 'goods',
        data: {
          action: 'detail',
          data: { goodsId: editId }
        },
        success: (res) => {
          wx.hideLoading()
          if (res.result.code === 0 && res.result.goods) {
            const goods = res.result.goods
            this.setData({
              isEditMode: true,
              editId,
              name: goods.name || '',
              desc: goods.desc || '',
              price: String(goods.price || ''),
              activeCategory: goods.category || 0,
              // 编辑模式：cloudImageIds 存已有的云文件ID，images 用云文件临时链接预览
              cloudImageIds: goods.cloudImageIds || [],
              images: [],  // 编辑时先展示已有图片（通过 cloudImageIds 渲染）
              latitude: goods.latitude || 0,
              longitude: goods.longitude || 0,
              locationName: goods.locationName || '',
              locationAddress: goods.locationAddress || '',
              locationText: goods.locationName
                ? goods.locationName
                : '点击选择商品所在位置',
            })
          } else {
            wx.showToast({ title: '商品不存在', icon: 'none' })
          }
        },
        fail: () => {
          wx.hideLoading()
          wx.showToast({ title: '加载失败', icon: 'none' })
        }
      })
      wx.setNavigationBarTitle({ title: '编辑商品' })
    }
  },

  onShow() {
    // 发布模式下不做清空。
    // 之前的写法会在 picker/chooseMedia 等原生 API
    // 返回触发 onShow 时把用户已填写的内容误清掉
    // 用户发布成功后会自动跳走，无需手动重置。
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onDescInput(e) {
    this.setData({ desc: e.detail.value })
  },

  onPriceInput(e) {
    // 只允许输入数字和小数点，且不能以 0 开头（除非是 "0.xx"）
    let val = e.detail.value
    // 去掉非数字非小数点字符
    val = val.replace(/[^\d.]/g, '')
    // 只能有一个小数点
    const parts = val.split('.')
    if (parts.length > 2) {
      val = parts[0] + '.' + parts.slice(1).join('')
    }
    // 限制小数点后两位
    if (parts.length === 2 && parts[1].length > 2) {
      val = parts[0] + '.' + parts[1].slice(0, 2)
    }
    this.setData({ price: val })
  },

  onCategoryTap(e) {
    this.setData({ activeCategory: e.currentTarget.dataset.id })
  },

  // 跳转到选位置页面（搜索 + 常用地址）
  chooseLocation() {
    wx.navigateTo({
      url: '/pages/location/location'
    })
  },

  // 清空表单（发布成功后调用）
  resetForm() {
    this.setData({
      images: [],
      cloudImageIds: [],
      name: '',
      desc: '',
      price: '',
      activeCategory: 0,
      locationName: '',
      locationAddress: '',
      locationText: '点击选择商品所在位置',
      latitude: 0,
      longitude: 0,
    })
  },

  // 选择图片（仅存本地临时路径用于预览）
  chooseImage() {
    const maxCount = 3 - this.data.images.length
    if (maxCount <= 0) {
      wx.showToast({ title: '最多上传3张图片', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: maxCount,
      mediaType: ['image'],
      success: (res) => {
        const newImages = res.tempFiles.map(file => file.tempFilePath)
        this.setData({
          images: [...this.data.images, ...newImages]
        })
      }
    })
  },

  deleteImage(e) {
    const index = e.currentTarget.dataset.index
    // 如果是编辑模式且删除的是已有云图片，同时从 cloudImageIds 移除
    if (this.data.isEditMode && index < this.data.cloudImageIds.length) {
      const cloudImageIds = [...this.data.cloudImageIds]
      cloudImageIds.splice(index, 1)
      this.setData({ cloudImageIds })
      return
    }
    // 新添加的图片：计算在 images 数组中的实际索引
    const existingCount = this.data.isEditMode ? this.data.cloudImageIds.length : 0
    const newIndex = index - existingCount
    if (newIndex >= 0) {
      const images = this.data.images
      images.splice(newIndex, 1)
      this.setData({ images })
    }
  },

  // ==========================================
  // 核心：提交商品（发布 / 编辑）
  // ==========================================
  async onSubmit() {
    // --- 防止重复点击 ---
    if (this.data.submitting) return

    const { isEditMode, editId, images, cloudImageIds, name, desc, price, activeCategory } = this.data

    // --- 表单校验 ---
    const totalImages = images.length + cloudImageIds.length
    if (totalImages === 0) {
      wx.showToast({ title: '请上传至少一张图片', icon: 'none' })
      return
    }
    if (!name) {
      wx.showToast({ title: '请输入商品名称', icon: 'none' })
      return
    }
    if (!desc) {
      wx.showToast({ title: '请输入商品详情', icon: 'none' })
      return
    }
    if (!price) {
      wx.showToast({ title: '请输入价格', icon: 'none' })
      return
    }
    if (activeCategory === 0) {
      wx.showToast({ title: '请选择商品分类', icon: 'none' })
      return
    }
    if (!this.data.latitude) {
      wx.showToast({ title: '请获取所在位置', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: isEditMode ? '保存中...' : '发布中...', mask: true })

    try {
      // --- 第1步：上传新图片到云存储 ---
      const uploadedIds = []
      for (const tempPath of images) {
        const cloudPath = `goods/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: tempPath
        })
        uploadedIds.push(uploadRes.fileID)
      }

      // 合并已有云图片和刚上传的图片
      const allImageIds = [...cloudImageIds, ...uploadedIds]

      // --- 第2步：调用云函数保存到数据库 ---
      const goodsData = {
        name,
        desc,
        price: Number(price),
        category: activeCategory,
        cloudImageIds: allImageIds,
        image: allImageIds[0],
        latitude: this.data.latitude,
        longitude: this.data.longitude,
        locationName: this.data.locationName,
        locationAddress: this.data.locationAddress,
      }

      if (isEditMode) {
        // 编辑：调用 update
        const res = await wx.cloud.callFunction({
          name: 'goods',
          data: {
            action: 'update',
            data: { goodsId: editId, updateData: goodsData }
          }
        })
        if (res.result.code !== 0) throw new Error(res.result.msg)
        wx.showToast({ title: '修改成功', icon: 'success' })
      } else {
        // 发布：调用 publish
        const res = await wx.cloud.callFunction({
          name: 'goods',
          data: {
            action: 'publish',
            data: goodsData
          }
        })
        if (res.result.code !== 0) throw new Error(res.result.msg)
        wx.showToast({ title: '发布成功', icon: 'success' })
        // 发布成功后清空表单，避免下次进入残留数据
        this.resetForm()
      }

      // --- 第3步：跳转 ---
      setTimeout(() => {
        if (isEditMode) {
          wx.switchTab({ url: '/pages/profile/profile' })
        } else {
          wx.switchTab({ url: '/pages/home/home' })
        }
      }, 1500)

    } catch (err) {
      console.error('提交失败:', err)
      wx.showToast({ title: err.message || '操作失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
      wx.hideLoading()
    }
  },

})
