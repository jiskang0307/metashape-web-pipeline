<template>
  <q-page class="flex flex-center">
    <div class="q-pa-md" style="max-width: 800px; width: 100%;">
      <q-card>
        <!-- 기존 코드 유지 -->
        <q-card-section>
          <div class="text-h6">Metashape Automation</div>
          <div class="text-subtitle2">360° Video to Point Cloud</div>
        </q-card-section>

        <!-- 파일 업로드 섹션 (기존 코드 유지) -->
        <q-card-section>
          <q-tabs
            v-model="inputMode"
            dense
            class="text-grey"
            active-color="primary"
            indicator-color="primary"
            align="justify"
          >
            <q-tab name="upload" label="Upload Video" icon="cloud_upload" />
            <q-tab name="path" label="Use Path" icon="folder" />
          </q-tabs>

          <q-separator />

          <q-tab-panels v-model="inputMode" animated class="q-mt-md">
            <q-tab-panel name="upload">
              <q-file
                v-model="videoFile"
                label="Select video file"
                accept="video/*"
                outlined
                clearable
                @update:model-value="onFileSelected"
              >
                <template v-slot:prepend>
                  <q-icon name="videocam" />
                </template>
                <template v-slot:hint>
                  MP4, AVI, MOV, MKV (Max 500MB)
                </template>
              </q-file>

              <q-btn
                v-if="videoFile && !uploadedFile"
                color="secondary"
                label="Upload Video"
                @click="uploadVideo"
                :loading="uploading"
                class="q-mt-md full-width"
                icon="cloud_upload"
              />

              <q-banner
                v-if="uploadedFile"
                class="bg-positive text-white q-mt-md rounded-borders"
              >
                <template v-slot:avatar>
                  <q-icon name="check_circle" color="white" />
                </template>
                File uploaded: {{ uploadedFile.originalname }}
                <br />
                <small>Size: {{ formatFileSize(uploadedFile.size) }}</small>
              </q-banner>
            </q-tab-panel>

            <q-tab-panel name="path">
              <q-input
                v-model="videoPath"
                label="Video Path"
                outlined
                dense
                class="q-mb-md"
              />
              
              <q-input
                v-model="projectPath"
                label="Project Path"
                outlined
                dense
                class="q-mb-md"
              />
              
              <q-input
                v-model="outputPath"
                label="Output LAZ Path"
                outlined
                dense
              />
            </q-tab-panel>
          </q-tab-panels>
        </q-card-section>

        <!-- 실행 버튼 -->
        <q-card-section>
          <q-btn
            color="primary"
            label="Run Metashape Process"
            @click="runProcess"
            :loading="processing"
            :disable="processing || (inputMode === 'upload' && !uploadedFile)"
            class="full-width"
            icon="play_arrow"
          />
        </q-card-section>

        <!-- 진행 상황 -->
        <q-card-section v-if="processing">
          <q-linear-progress 
            indeterminate 
            color="secondary" 
            class="q-mb-md"
          />
          <div class="text-caption text-grey-7">
            Processing... This may take several minutes.
          </div>
        </q-card-section>

        <!-- 로그 -->
        <q-card-section v-if="logs.length > 0">
          <div class="text-subtitle2 q-mb-sm">Process Logs:</div>
          <q-scroll-area style="height: 200px; background: #f5f5f5;" class="q-pa-sm rounded-borders">
            <div 
              v-for="(log, index) in logs" 
              :key="index"
              class="text-caption q-mb-xs"
            >
              {{ log }}
            </div>
          </q-scroll-area>
        </q-card-section>

        <!-- 결과 -->
        <q-card-section v-if="result">
          <q-banner 
            :class="result.success ? 'bg-positive' : 'bg-negative'" 
            class="text-white rounded-borders"
          >
            <template v-slot:avatar>
              <q-icon 
                :name="result.success ? 'check_circle' : 'error'" 
                color="white" 
              />
            </template>
            {{ result.message }}
          </q-banner>
          
          <div v-if="result.success && result.outputFilename" class="q-mt-md">
            <div class="text-subtitle2">Output File:</div>
            <div class="text-body2 text-grey-8 q-mb-md">{{ result.outputFilename }}</div>
            
            <div class="row q-gutter-sm">
              <q-btn
                color="primary"
                label="Download LAZ"
                icon="download"
                @click="downloadFile(result.outputFilename)"
                outline
              />
              
              <q-btn
                color="secondary"
                label="Convert to Potree"
                icon="transform"
                @click="convertToPotree(result.outputFilename)"
                :loading="convertingPotree"
                outline
              />
            </div>
          </div>
        </q-card-section>

        <!-- Potree 변환 결과 -->
        <q-card-section v-if="potreeResult">
          <q-separator class="q-mb-md" />
          
          <q-banner 
            :class="potreeResult.success ? 'bg-info' : 'bg-negative'" 
            class="text-white rounded-borders"
          >
            <template v-slot:avatar>
              <q-icon 
                :name="potreeResult.success ? 'check_circle' : 'error'" 
                color="white" 
              />
            </template>
            {{ potreeResult.message }}
          </q-banner>

          <div v-if="potreeResult.success" class="q-mt-md">
            <div class="text-subtitle2">Generated Files:</div>
            <ul class="text-body2">
              <li v-for="file in potreeResult.files" :key="file">{{ file }}</li>
            </ul>
            <div class="text-caption text-grey-7 q-mt-sm q-mb-md">
              Location: {{ potreeResult.outputDir }}
            </div>
            
            <!-- View 버튼 추가 -->
            <q-btn
              color="positive"
              label="View Point Cloud"
              icon="visibility"
              @click="viewPotree"
              class="full-width"
            />
          </div>
        </q-card-section>

      </q-card>
    </div>
  </q-page>
</template>

<script>
import { ref } from 'vue';
import axios from 'axios';
import { useRouter } from 'vue-router';

export default {
  name: 'IndexPage',
  
  setup() {
    const processing = ref(false);
    const uploading = ref(false);
    const convertingPotree = ref(false);
    const result = ref(null);
    const potreeResult = ref(null);
    const logs = ref([]);
    const router = useRouter();
    const inputMode = ref('upload');
    
    const videoFile = ref(null);
    const uploadedFile = ref(null);
    
    const videoPath = ref('D:/metashape_automation/10stest.mp4');
    const projectPath = ref('D:/metashape_automation/project.psx');
    const outputPath = ref('D:/metashape_automation/output.laz');

    const API_BASE = 'http://localhost:3000/api';

    const onFileSelected = (file) => {
      if (file) {
        uploadedFile.value = null;
        result.value = null;
        potreeResult.value = null;
      }
    };

    const formatFileSize = (bytes) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    const uploadVideo = async () => {
      if (!videoFile.value) return;

      uploading.value = true;
      logs.value = [];
      logs.value.push('Uploading video file...');

      try {
        const formData = new FormData();
        formData.append('video', videoFile.value);

        const response = await axios.post(`${API_BASE}/upload-video`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            logs.value[logs.value.length - 1] = `Uploading: ${percentCompleted}%`;
          }
        });

        uploadedFile.value = response.data.file;
        logs.value.push('✓ Upload complete!');

      } catch (error) {
        console.error('Upload error:', error);
        logs.value.push(`✗ Upload failed: ${error.message}`);
        result.value = {
          success: false,
          message: 'Upload failed: ' + error.message
        };
      } finally {
        uploading.value = false;
      }
    };

    const runProcess = async () => {
      processing.value = true;
      result.value = null;
      potreeResult.value = null;
      logs.value = [];

      try {
        logs.value.push('Starting Metashape process...');
        
        const requestData = inputMode.value === 'upload'
          ? {
              useUploadedFile: true,
              videoFilename: uploadedFile.value.filename
            }
          : {
              useUploadedFile: false,
              videoPath: videoPath.value,
              projectPath: projectPath.value,
              outputPath: outputPath.value
            };

        const response = await axios.post(`${API_BASE}/process-metashape`, requestData, {
          timeout: 600000
        });

        logs.value.push('✓ Process completed!');
        
        result.value = {
          success: true,
          message: response.data.message,
          outputPath: response.data.outputPath,
          outputFilename: response.data.outputFilename
        };

      } catch (error) {
        console.error('Error:', error);
        
        const errorMessage = error.response?.data?.error || error.message;
        logs.value.push(`✗ Error: ${errorMessage}`);
        
        result.value = {
          success: false,
          message: 'Process failed: ' + errorMessage
        };
        
      } finally {
        processing.value = false;
      }
    };

    const convertToPotree = async (lazFilename) => {
      convertingPotree.value = true;
      potreeResult.value = null;

      try {
        logs.value.push('Starting Potree conversion...');

        const response = await axios.post(`${API_BASE}/convert-to-potree`, {
          lazFilename: lazFilename
        }, {
          timeout: 300000 // 5분
        });

        logs.value.push('✓ Potree conversion complete!');

        potreeResult.value = {
          success: true,
          message: 'Potree conversion complete',
          files: response.data.files,
          outputDir: response.data.outputDir,
          potreeFolder: response.data.potreeFolder
        };

      } catch (error) {
        console.error('Potree conversion error:', error);
        
        const errorMessage = error.response?.data?.error || error.message;
        logs.value.push(`✗ Potree conversion failed: ${errorMessage}`);
        
        potreeResult.value = {
          success: false,
          message: 'Potree conversion failed: ' + errorMessage
        };
      } finally {
        convertingPotree.value = false;
      }
    };

    const downloadFile = (filename) => {
      window.open(`${API_BASE}/download/${filename}`, '_blank');
    };

    const viewPotree = () => {
      if (potreeResult.value && potreeResult.value.potreeFolder) {
        router.push({
          name: 'potree-viewer',
          params: { folder: potreeResult.value.potreeFolder }
        });
      }
    };

    return {
      processing,
      uploading,
      convertingPotree,
      result,
      potreeResult,
      logs,
      inputMode,
      videoFile,
      uploadedFile,
      videoPath,
      projectPath,
      outputPath,
      onFileSelected,
      formatFileSize,
      uploadVideo,
      runProcess,
      convertToPotree,
      downloadFile,
      viewPotree
    };
  }
};
</script>

<style scoped>
.rounded-borders {
  border-radius: 8px;
}
</style>