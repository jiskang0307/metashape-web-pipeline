import Metashape
import sys
import os

def print_progress(message):
    """진행 상황을 출력하고 즉시 flush"""
    print(message, flush=True)

try:
    # 커맨드라인 인자로 경로 받기
    video_path = sys.argv[1] if len(sys.argv) > 1 else "D:/metashape_automation/10stest.mp4"
    project_path = sys.argv[2] if len(sys.argv) > 2 else "D:/metashape_automation/project.psx"
    export_laz_path = sys.argv[3] if len(sys.argv) > 3 else "D:/metashape_automation/output.laz"

    print_progress(f"Starting process with video: {video_path}")
    
    # 프로젝트 생성
    doc = Metashape.Document()
    doc.save(project_path)
    chunk = doc.addChunk()

    # 1) Video → Frames 추출
    print_progress("Step 1/5: Importing video and extracting frames...")
    chunk.importVideo(
        path=video_path,
        image_path="D:/metashape_automation/frames/frame_{filenum}.jpg",
        frame_step=Metashape.FrameStep.CustomFrameStep,
        custom_frame_step=10,
        time_start=0,
        time_end=-1
    )

    # Camera type 설정
    for cam in chunk.cameras:
        cam.sensor.type = Metashape.Sensor.Type.Spherical
    
    doc.save()
    print_progress("✓ Video imported successfully")

    # 2) Align Photos
    print_progress("Step 2/5: Matching photos...")
    chunk.matchPhotos(
        downscale=1,
        generic_preselection=False,
        reference_preselection=False,
        keypoint_limit=70000,
        tiepoint_limit=10000
    )
    print_progress("✓ Photos matched")

    print_progress("Step 3/5: Aligning cameras...")
    chunk.alignCameras(adaptive_fitting=False)
    chunk.optimizeCameras()
    doc.save()
    print_progress("✓ Cameras aligned")

    # 3) Build Point Cloud
    print_progress("Step 4/5: Building depth maps...")
    chunk.buildDepthMaps(
        downscale=2,
        filter_mode=Metashape.MildFiltering
    )
    print_progress("✓ Depth maps built")

    print_progress("Building point cloud...")
    chunk.buildPointCloud(
        source_data=Metashape.DepthMapsData,
        point_confidence=True
    )
    doc.save()
    print_progress("✓ Point cloud built")

    # 4) LAZ Export
    print_progress("Step 5/5: Exporting LAZ file...")
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

    print_progress("=== LAZ Export Complete ===")
    print_progress(f"Output file: {export_laz_path}")

except Exception as e:
    print_progress(f"ERROR: {str(e)}")
    sys.exit(1)