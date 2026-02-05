import Metashape
import sys
import os

# 전역 변수로 현재 단계 관리
current_step = 0
step_weights = {
    1: (0, 20),      # Video import: 0-20%
    2: (20, 40),     # Match photos: 20-40%
    3: (40, 60),     # Align cameras: 40-60%
    4: (60, 80),     # Build depth maps: 60-80%
    5: (80, 95),     # Build point cloud: 80-95%
    6: (95, 100)     # Export LAZ: 95-100%
}


def print_progress(message, progress=None):
    """진행 상황을 출력"""
    if progress is not None:
        print(f"PROGRESS:{progress}:{message}", flush=True)
    else:
        print(message, flush=True)

def make_callback(step_num):
    """각 단계별 콜백 함수 생성"""
    def callback(p):
        if p < 0:
            p = 0
        elif p > 1:
            p = 1
            
        start_pct, end_pct = step_weights[step_num]
        current_pct = start_pct + (end_pct - start_pct) * p
        
        print(f"PROGRESS:{int(current_pct)}:Processing step {step_num}/6...", flush=True)
        return True
    
    return callback

try:
    video_path = sys.argv[1] if len(sys.argv) > 1 else "test_video.mp4"
    project_path = sys.argv[2] if len(sys.argv) > 2 else "project.psx"
    export_laz_path = sys.argv[3] if len(sys.argv) > 3 else "output.laz"

    video_dir = os.path.dirname(video_path)
    frames_dir = os.path.join(video_dir, "frames")

    os.makedirs(frames_dir, exist_ok=True)

    frame_path = os.path.join(frames_dir, "frame_{filenum}.jpg")

    print_progress(f"Starting process with video: {video_path}", 0)
    
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    # 프로젝트 생성
    doc = Metashape.Document()
    doc.save(project_path)
    chunk = doc.addChunk()

    # ===== STEP 1: Video → Frames 추출 (0-20%) =====
    current_step = 1
    print_progress("Step 1/6: Importing video and extracting frames...", 0)
    
    chunk.importVideo(
        path=video_path,
        image_path=frame_path,
        frame_step=Metashape.FrameStep.CustomFrameStep,
        custom_frame_step=1,
        time_start=0,
        time_end=-1
    )

    for cam in chunk.cameras:
        cam.sensor.type = Metashape.Sensor.Type.Spherical
    
    doc.save()
    print_progress("✓ Video imported successfully", 20)

    # ===== STEP 2: Match Photos (20-40%) =====
    current_step = 2
    print_progress("Step 2/6: Matching photos...", 20)
    
    chunk.matchPhotos(
        downscale=1,
        generic_preselection=False,
        reference_preselection=False,
        keypoint_limit=70000,
        tiepoint_limit=10000,
        progress=make_callback(2)
    )
    
    print_progress("✓ Photos matched", 40)

    # ===== STEP 3: Align Cameras (40-60%) =====
    current_step = 3
    print_progress("Step 3/6: Aligning cameras...", 40)
    
    chunk.alignCameras(
        adaptive_fitting=False,
        progress=make_callback(3)
    )
    
    print_progress("Optimizing cameras...", 55)
    chunk.optimizeCameras()
    doc.save()
    
    print_progress("✓ Cameras aligned", 60)

    # ===== STEP 4: Build Depth Maps (60-80%) =====
    current_step = 4
    print_progress("Step 4/6: Building depth maps...", 60)
    
    chunk.buildDepthMaps(
        downscale=2,
        filter_mode=Metashape.MildFiltering,
        progress=make_callback(4)
    )
    
    print_progress("✓ Depth maps built", 80)

    # ===== STEP 5: Build Point Cloud (80-95%) =====
    current_step = 5
    print_progress("Step 5/6: Building point cloud...", 80)
    
    chunk.buildPointCloud(
        source_data=Metashape.DepthMapsData,
        point_confidence=True,
        progress=make_callback(5)
    )
    
    doc.save()
    print_progress("✓ Point cloud built", 95)

    # ===== STEP 6: LAZ Export (95-100%) =====
    current_step = 6
    print_progress("Step 6/6: Exporting LAZ file...", 95)
    
    chunk.exportPointCloud(
        path=export_laz_path,
        source_data=Metashape.PointCloudData,
        format=Metashape.PointCloudFormatLAZ,
        save_point_color=True,
        save_point_normal=True,
        save_point_confidence=True,
        save_point_classification=True,
        compression=True
    )

    print_progress("=== LAZ Export Complete ===", 100)
    print_progress(f"Output file: {export_laz_path}", 100)

except Exception as e:
    print_progress(f"ERROR: {str(e)}", 0)
    import traceback
    print_progress(traceback.format_exc(), 0)
    sys.exit(1)