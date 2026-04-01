import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.setFrame(windowFrame, display: true)

    // Window configuration for the native Flutter customer app shell
    self.title = "Ruh — Your AI Assistant"
    self.minSize = NSSize(width: 800, height: 600)
    self.setContentSize(NSSize(width: 1200, height: 800))
    self.center()
    self.titlebarAppearsTransparent = false

    RegisterGeneratedPlugins(registry: flutterViewController)

    super.awakeFromNib()
  }
}
