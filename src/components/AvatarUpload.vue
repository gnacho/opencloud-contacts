<template>
  <div class="avatar-upload">
    <div
      class="avatar-preview"
      :style="previewStyle"
      :title="$gettext('Click to change photo')"
      @click="fileInput?.click()"
    >
      <img v-if="modelValue" :src="modelValue" class="avatar-img" />
      <span v-else class="avatar-initials">{{ initials }}</span>
      <div class="avatar-overlay">
        <oc-icon name="camera" size="small" color="#fff" />
      </div>
    </div>

    <oc-button
      v-if="modelValue"
      appearance="raw"
      class="avatar-remove"
      :aria-label="$gettext('Remove photo')"
      @click="$emit('update:modelValue', '')"
    >
      <oc-icon name="close" size="small" />
    </oc-button>

    <input
      ref="fileInput"
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp"
      class="avatar-file-input"
      @change="onFile"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGettext } from 'vue3-gettext'

const props = defineProps<{
  modelValue: string   // data URI or empty
  displayName: string
}>()

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const { $gettext } = useGettext()
const fileInput = ref<HTMLInputElement | null>(null)

const palette = [
  '#0063BE', '#006F67', '#9B4D00', '#7B2D8B', '#C31F39',
  '#00647A', '#4A6741', '#7A4700', '#2B5EA7', '#8A3B6B'
]

function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return palette[Math.abs(hash) % palette.length]
}

const initials = computed(() => {
  const parts = props.displayName.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return props.displayName.slice(0, 2).toUpperCase()
})

const previewStyle = computed(() => {
  if (props.modelValue) return {}
  return { backgroundColor: stringToColor(props.displayName || '?') }
})

function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  // Resize to max 256x256 before storing
  const reader = new FileReader()
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string
    const img = new Image()
    img.onload = () => {
      const MAX = 256
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      emit('update:modelValue', canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = dataUrl
  }
  reader.readAsDataURL(file)

  // Reset input so the same file can be selected again
  ;(event.target as HTMLInputElement).value = ''
}
</script>

<style scoped>
.avatar-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  position: relative;
}

.avatar-preview {
  width: 6rem;
  height: 6rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-initials {
  font-size: 2rem;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

.avatar-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}

.avatar-preview:hover .avatar-overlay {
  opacity: 1;
}

.avatar-remove {
  font-size: 0.75rem;
  color: var(--oc-color-swatch-danger-default);
}

.avatar-file-input {
  display: none;
}
</style>
