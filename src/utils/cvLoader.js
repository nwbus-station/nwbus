// غلاف لـ OpenCV: كائنه «thenable»، وتصديره مباشرة عبر import() الديناميكي يعلّق المتصفح (حلقة لا نهائية)
import cvRaw from '@techstark/opencv-js'
export const getRawCV = () => ({ raw: cvRaw })
