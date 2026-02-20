<template>
  <q-page class="full-height">
    <div class="absolute-top-left q-pa-md" style="z-index: 1000;">
      <q-btn 
        flat 
        round 
        dense 
        icon="arrow_back" 
        color="white" 
        @click="$router.back()"
        class="bg-primary"
        style="box-shadow: 0 2px 8px rgba(0,0,0,0.3);"
      />
    </div>
    
    <iframe 
      :src="potreeUrl" 
      style="width: 100%; height: 100vh; border: none;"
      @load="onIframeLoad"
    ></iframe>
    
    <!-- 로딩 인디케이터 -->
    <div v-if="loading" class="absolute-center">
      <q-spinner-dots size="50px" color="primary" />
      <div class="q-mt-md text-center">Loading Point Cloud...</div>
    </div>
  </q-page>
</template>

<script>
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';

export default {
  name: 'PotreeViewer',
  
  setup() {
    const route = useRoute();
    const loading = ref(true);
    
    const potreeUrl = computed(() => {
      const folder = route.params.folder;
      return `http://172.17.4.101:3001/potree_data/${folder}/index.html`;
    });
    
    const onIframeLoad = () => {
      loading.value = false;
    };
    
    onMounted(() => {
      console.log('Loading Potree from:', potreeUrl.value);
    });
    
    return {
      potreeUrl,
      loading,
      onIframeLoad
    };
  }
};
</script>

<style scoped>
.absolute-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 100;
}
</style>