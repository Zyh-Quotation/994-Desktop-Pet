// 前景抠图工具：输入一张图片，输出透明背景的前景 PNG + JSON 元信息
// 用法：cutout <input.png/jpg> <output.png> [output.json]
// 依赖 macOS 14+（VNGenerateForegroundInstanceMaskRequest 在 14.0 引入）
import Foundation
import Vision
import CoreImage
import AppKit

let args = CommandLine.arguments
guard args.count > 2 else {
  fputs("usage: cutout in.png out.png [out.json]\n", stderr); exit(1)
}
let inURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])

guard let src = CGImageSourceCreateWithURL(inURL as CFURL, nil),
      let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
  fputs("ERR cannot read image\n", stderr); exit(2)
}

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
let req = VNGenerateForegroundInstanceMaskRequest()
do {
  try handler.perform([req])
} catch {
  fputs("ERR perform: \(error)\n", stderr); exit(3)
}

guard let obs = req.results?.first else {
  // 没检测到前景：退回原图加白色兜底（至少能用）
  fputs("WARN no foreground instances, using original\n", stderr)
  guard let dest = CGImageDestinationCreateWithURL(outURL as CFURL, "public.png" as CFString, 1, nil) else { exit(5) }
  CGImageDestinationAddImage(dest, cg, nil)
  _ = CGImageDestinationFinalize(dest)
  print("{\"ok\":true,\"width\":\(cg.width),\"height\":\(cg.height),\"fallback\":true}")
  exit(0)
}

let masked: CVPixelBuffer
do {
  masked = try obs.generateMaskedImage(ofInstances: obs.allInstances, from: handler, croppedToInstancesExtent: true)
} catch {
  fputs("ERR mask: \(error)\n", stderr); exit(4)
}

let ci = CIImage(cvPixelBuffer: masked)
let ctx = CIContext()
guard let out = ctx.createCGImage(ci, from: ci.extent) else {
  fputs("ERR render\n", stderr); exit(5)
}

guard let dest = CGImageDestinationCreateWithURL(outURL as CFURL, "public.png" as CFString, 1, nil) else {
  fputs("ERR dest\n", stderr); exit(6)
}
CGImageDestinationAddImage(dest, out, nil)
guard CGImageDestinationFinalize(dest) else {
  fputs("ERR write\n", stderr); exit(7)
}

let info: [String: Any] = ["ok": true, "width": out.width, "height": out.height, "fallback": false]
if args.count > 3 {
  let jsonData = try! JSONSerialization.data(withJSONObject: info, options: [])
  FileManager.default.createFile(atPath: args[3], contents: jsonData)
}
print("\(info["ok"] ?? false) masked \(out.width)x\(out.height)")
