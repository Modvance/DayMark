using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class DesktopPanel {
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  delegate bool EnumProc(IntPtr hwnd, IntPtr value);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string name, string title);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int count);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr value);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr hwnd);
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr hwnd, ref Point point);
  [DllImport("user32.dll", SetLastError=true)] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int command);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetLong64(IntPtr hwnd, int index);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")] static extern int GetLong32(IntPtr hwnd, int index);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW", SetLastError=true)] static extern IntPtr SetLong64(IntPtr hwnd, int index, IntPtr value);
  [DllImport("user32.dll", EntryPoint="SetWindowLongW", SetLastError=true)] static extern int SetLong32(IntPtr hwnd, int index, int value);
  [DllImport("kernel32.dll")] static extern void SetLastError(uint error);
  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref uint value, int size);
  [DllImport("gdi32.dll")] static extern IntPtr CreateRoundRectRgn(int left,int top,int right,int bottom,int width,int height);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr value);
  [DllImport("user32.dll")] static extern int SetWindowRgn(IntPtr hwnd,IntPtr region,bool redraw);
  static long GetLong(IntPtr h, int index) { return (IntPtr.Size==8 ? GetLong64(h,index).ToInt64() : GetLong32(h,index)) & 0xffffffffL; }
  static void SetLong(IntPtr h,int index,long value) {
    SetLastError(0);
    if(IntPtr.Size==8) SetLong64(h,index,new IntPtr(unchecked((int)value))); else SetLong32(h,index,unchecked((int)value));
    int error=Marshal.GetLastWin32Error(); if(error!=0) throw new Win32Exception(error);
  }
  static IntPtr DesktopHost() {
    IntPtr host=IntPtr.Zero;
    // Use the host of the desktop icon view. The panel is a sibling above the icon
    // view, so it remains interactive; it is not placed behind the desktop icons.
    EnumWindows(delegate(IntPtr h,IntPtr unused) {
      StringBuilder name=new StringBuilder(256);GetClassName(h,name,name.Capacity);
      if((name.ToString()=="Progman" || name.ToString()=="WorkerW") && FindWindowEx(h,IntPtr.Zero,"SHELLDLL_DefView",null)!=IntPtr.Zero) { host=h;return false; }
      return true;
    },IntPtr.Zero);
    if(host==IntPtr.Zero) throw new Exception("未找到 Windows Explorer 桌面容器。请确认资源管理器正在运行。");
    return host;
  }
  public static string Apply(long handle,bool pinned,bool visible,int x,int y,int width,int height) {
    IntPtr previous=IntPtr.Zero;
    try {
      try { previous=SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch(EntryPointNotFoundException) { }
      return ApplyCore(handle,pinned,visible,x,y,width,height);
    } finally { if(previous!=IntPtr.Zero)SetThreadDpiAwarenessContext(previous); }
  }
  static string ApplyCore(long handle,bool pinned,bool visible,int x,int y,int width,int height) {
    IntPtr h=new IntPtr(handle);
    if(!IsWindow(h)) throw new Exception("面板窗口已失效，请重新显示桌面面板。");
    IntPtr parent=pinned ? IntPtr.Zero : DesktopHost();
    long style=GetLong(h,-16);
    // No native caption, resize frame, or bevel: resizing is handled by the UI.
    style &= ~0x00c40000L;
    if(pinned) style=(style & ~0x40000000L) | 0x80000000L;
    else style=(style & ~0x80000000L) | 0x40000000L;
    if(GetParent(h)!=parent) {
      if(!pinned) SetLong(h,-16,style);
      SetLastError(0); SetParent(h,parent);
      int error=Marshal.GetLastWin32Error();
      if(error!=0) throw new Win32Exception(error,"无法切换桌面父窗口");
      if(GetParent(h)!=parent) throw new Exception("桌面父窗口切换未生效");
    }
    SetLong(h,-16,style);
    SetLong(h,-20,(GetLong(h,-20) & ~0x20301L) | 0x80L);
    Point point=new Point { X=x,Y=y };
    if(parent!=IntPtr.Zero && !ScreenToClient(parent,ref point)) throw new Exception("无法换算桌面位置");
    // 34 = DWMWA_BORDER_COLOR; NONE on Windows 11. Older systems ignore it.
    uint border=0xfffffffe; try { DwmSetWindowAttribute(h,34,ref border,4); } catch { }
    uint flags=0x0020u|0x0010u|(visible?0x0040u:0x0080u);
    if(!SetWindowPos(h,pinned?new IntPtr(-1):IntPtr.Zero,point.X,point.Y,width,height,flags)) throw new Win32Exception(Marshal.GetLastWin32Error());
    // Clip the actual opaque window, so rounded corners do not expose a black
    // transparent-window backing surface. Windows owns the region on success.
    IntPtr region=CreateRoundRectRgn(0,0,width+1,height+1,28,28);
    if(region!=IntPtr.Zero && SetWindowRgn(h,region,visible)==0) DeleteObject(region);
    if(!visible) ShowWindow(h,0);
    return pinned?"pinned":"desktop";
  }
}
