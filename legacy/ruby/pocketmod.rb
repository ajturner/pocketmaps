require 'rubygems'
require 'pdf/writer'

require 'RMagick'
include Magick

class Pocketmod < PDF::Writer
  attr_accessor :sect_width, :sect_height
  def initialize(args = {})
    super
    
    case args[:paper]
    when /letter/
      args[:dimensions] ||= [612, 792]
    when /A4/
      args[:dimensions] ||= [595.28, 841.89]
    end
    
    args[:dimensions] ||= [612, 792]
    args[:margin] ||= 10

    @version = '0.6'
    @FontSize = 10
    @cMargin = 10
    
    @pg   = 1
    @sect = nil


    @page_types = {
      1 => 'a',
      2 => 'b',
      3 => 'd',
      4 => 'f',
      5 => 'h',
      6 => 'g',
      7 => 'e',
      8 => 'c',
    }

    @page_dims = args[:dimensions]
    @margin = args[:margin]

    w, h = @page_dims

    @sect_width  = h / 4-2 * @margin
    @sect_height = w / 2-2 * @margin - 1.1 * 10/72 # FIX ME...use real fontsize for page numbers

    @types = {
      'a' => {'type' => 'D', 'y' => @margin},
      'b' => {'type' => 'U', 'y' => 1*h/4 - @margin},
      'c' => {'type' => 'D', 'y' => 1*h/4 + @margin},
      'd' => {'type' => 'U', 'y' => 2*h/4 - @margin}, 
      'e' => {'type' => 'D', 'y' => 2*h/4 + @margin},
      'f' => {'type' => 'U', 'y' => 3*h/4 - @margin},
      'g' => {'type' => 'D', 'y' => 3*h/4 + @margin},
      'h' => {'type' => 'U', 'y' => h - @margin}
    }

    @buffer    = {}
    @imgbuffer = {}

    @dpi = 72

    @lastx = nil
    @lasty = nil

    @stopx = nil
    @stopy = nil

    @box = {}

    #

    @args = args

  end
  #################################################### */

  def place_image(path, pg, args)

    sect = sect_for_page_number(pg)
    type = @page_types[sect]
    data = @types[type]

    ps = ImageList.new(path).first

    iw, ih = [ps.columns, ps.rows]

    # iw = iw / @dpi
    # ih = ih / @dpi

    s_y = data['y']
    s_x = start_x(data['type'])

    # puts "#{s_x}, #{s_y} + #{args['x']}, #{args['y']}"
    if (data['type']=='D')
      s_y += args['x']
      s_x -= args['y']
    else 
      s_y -= args['x']
      s_x += args['y']
    end

    # max_h = (@sect_height - 0.1875) - args['y']
    # max_w = (@sect_width) - args['x']
    # 
    # if ((args['w']) && (args['w'] < max_w))
    #   max_w = args['w']
    # end
    # 
    # if ((args['h']) && (args['h'] < max_h))
    #   max_h = args['h']
    # end
    # 
    # if ((iw > max_h) || (ih > max_w))
    #   iw, ih = scale_dimensions(iw, ih, max_h, max_w)
    # end

    if (data['type']=='D')
      s_x -= iw
    else 
      s_y -= ih
    end

    # check to see if the offset of the
    # image will bleed over a 'page' - resize
    # it if does...

    # FIX ME :
    # BUFFER ME...

    # ps  = Image(path, start_x, start_y, iw, ih)
    # record_image(pg, ps)
    # puts "Page: #{pg} => #{s_x}, #{s_y} (#{iw}, #{ih})"
    
    if ( ! @imgbuffer[pg].is_a?(Array) )
      @imgbuffer[pg] = []
    end

    @imgbuffer[pg] << {:image => ps.to_blob, :x => s_x, :y => s_y }

    return { 'x' => (s_x + iw), 'y' => (s_y + ih), 'page' => pg}
  end

  #################################################### */

  def scale_dimensions(src_w, src_h, max_w, max_h)

    if (max_h > max_w)
      h = src_h * (max_w / src_w)
      w = max_w

    else 
      w = src_w * (max_h / src_h)
      h = max_h
    end

    return [w, h]
  end

  #################################################### */

  def add_some_image(path, pg='', args={}) 

    ['x', 'y', 'w', 'h'].each do |key|
      args[key] = 0 if !args.include?(key)
    end

    image = ImageList.new(path).first

    if (! image)
      puts("'{path}' is not a valid file")
      return 0
    end

    sect = sect_for_page_number(pg)
    type = @page_types[sect]
    data = @types[type]

    rotate = (data['type']=='D') ? 90 : 270

    new_img = image.rotate(rotate)

    new_img.resize!(args['w'], args['h']) if args['w'] != 0 && args['h'] != 0
    tmp = "/tmp/pocketmap_image_#{rand(10000)}.jpg"
    new_img.write(tmp)    
    
    res = place_image(tmp, pg, args)
    File.delete(tmp)
    # unlink(tmp)

    return res
  end

  # #################################################### 

  def add_some_text(txt, pg = '', args = {})
    if(!args.keys.include?('resume'))
      args['resume'] = true
      if (! pg)
        pg = @pg
      else 
        if (pg != @pg)
          args['resume'] = false
        end
      end
    end
    
    remainder = buffer(utf8_decode(txt), pg, args) 
    return { 'page' => @pg, 'x' => @lastx, 'y' => @lasty, 'txt' => remainder}
  end

  # #################################################### */

  def utf8_decode(s)
    s
  end

  def AddPage()
    self.start_new_page    
  end
  
  def Output(name='', pgs = 1)
    cnt    = 8 * pgs.to_i
    sheets = ((cnt + 1) / 8).ceil

    first = 1
    last  = sheets * 8


    (1..sheets).each do |sh|

      AddPage() if sh != 1

      if (!@args[:folds].nil?)
        draw_folds()
      end

      if (!@args[:borders].nil?)
        draw_borders()
      end

      (first..(first + 3)).each do |i| 
        write_page(i)
        write_images(i)
      end
      
      ((last-3)..last).each do |j|
        write_page(j)
        write_images(j)
      end

      first += 4
      last  -= 4
    end

    self.save_as(name)
  end

  # #################################################### */

  def draw_folds(gr=173)

    w, h = @page_dims

    move_to(0,h/4).line_to(w,h/4).close_stroke
    move_to(0,h/4*2).line_to(w,h/4*2).close_stroke
    move_to(0,h/4*3).line_to(w,h/4*3).close_stroke
    move_to(w/2,0).line_to(w/2,h).close_stroke

  end

  ####################################################

  def draw_borders()

    w, h = @page_dims

    @types.each do |type, data|
      Line(0, data['y'], w, data['y'])
    end

    # FIX ME...use real fontsize for page numbers (assumes 10pt)
    x = [ @margin, @margin + 1.1*10/72, @page_dims[0]/2 - @margin,
    @page_dims[0]/2 + @margin, @page_dims[0] - @margin - 1.1*10/72, @page_dims[0] - @margin]

    x.each do |i|
      Line(i, 0, i, h)
    end
  end

  #################################################### */

  def sect_for_page_number(pg)
    while (pg > 8)
      pg -= 8
    end

    return pg
  end

  #################################################### */

  def reset_buffer()
    @buffer = {}
  end

  #################################################### */

  def buffer(txt, pg, args)

    sect = sect_for_page_number(pg)

    @pg   = pg
    @sect = sect

    txt = buffer_do(txt, args)

    unless (txt.empty?)

      if (args['nopagination'])
        return txt
      end

      pg += 1
      return buffer(txt, pg, args)
    end

    return ''
  end

  #################################################### */
  # 
  def write_page(i)
  
    write_page_number(i)
  
    if (@buffer[i].is_a?(Array))
      @buffer[i].each do |line|
          write_text_block(i, line, line[:lines] || 5)
      end
    end
    #   
    # if (@buffer[idx].is_a?(Array))
    #   @box[idx].each do |c|
    #     Line(c[0], c[1], c[2], c[3])
    #   end
    # end
  end
  
  def write_images(pg)
    if (! @imgbuffer.include?(pg))
      return
    end
    @imgbuffer[pg].each do |img|
      self.add_image(img[:image], img[:x], img[:y])
    end
    # out(implode("\n", @imgbuffer[pg]))
  end

  def write_text_block(pg, line, lines)
    sect = sect_for_page_number(pg)
    type = @page_types[sect]
    data = @types[type]
        
    rest = line[:txt]
    offset = data['type'] == 'U' ? 10 : -10
    (0..lines).each do |i|
      rest = add_text_wrap( line[:x] + i*offset, line[:y], @sect_width, rest, 10, :left, line[:rot])
      break if rest.length <= 0
    end
  end
  #################################################### */

  def write_page_number(pg)

    sect = sect_for_page_number(pg)
    type = @page_types[sect]
    data = @types[type]

    cf = @CurrentFont

    fa = @FontFamily
    st = @FontStyle
    pt = @FontSizePt
    sz = @FontSize

    # SetFont('Helvetica', '', 40)
    # SetFontSize(10)

    ln =  @FontSize

    w = @sect_width
    # s = GetStringWidth(pg.to_s)
    s = 10
    odd = (pg % 2) ? 1 : 0

    if (data['type'] == 'D')
      x = @margin
      y = (odd) ? data['y'] + (w - s) : data['y']
    else 
      x = @page_dims[0] - @margin
      y = (odd) ? data['y'] - (w - s) : data['y']		
    end

    # ps = TextWithDirection(x, y, pg, data['type'])
    # out(ps)
    add_text(x, y, pg, @FontSize, data['type'] == 'U' ? 90 : 270)

    # SetFont(fa, st, pt)
    # SetFontSize(pt)
    return
  end

  #################################################### */

  def buffer_do(txt, args)

    #Shamelessy pilfered from the FPDF Multi-Cell def */

    w = @sect_width
    h = @sect_height

    type = @page_types[@sect]
    data = @types[type]

    if (args['resume'] && @lastx && @lasty)
      x = @lastx
      y = @lasty
    else 
      y = data['y'] + (data['type'] == 'U' ? -@sect_width : @sect_width)
      x =  start_x(data['type'])
    end

    #
    # Next set up special cases
    #

    @stopx = nil
    @stopy = nil

    if ((args['x']) && (args['x'] < @sect_width))
      y = y + (data['type']=='U' ? args['x'] : -args['x'])
      w -= args['x']
    end

    if ((args['y']) && (args['y'] < @sect_height))
      x = x + (data['type']=='U' ? args['y'] : -args['y'])

      h -= args['y']
    end


    if (args['h'])

      if (data['type']=='U')
        @stopx = x + args['h']
      else 
        @stopx = x - args['h']
      end

      h = args['h']
    end

    if (args['w'])
      if (data['type']=='U')
        @stopy = y - args['w']
      else 
        @stopy = y + args['w']
      end

      w = args['w']
    end
    
    if (! @buffer[@pg].is_a?(Array))
      @buffer[@pg] = []
    end

    @buffer[@pg] << { :x => x, :y => y, :txt => txt, :rot => data['type'] == 'U' ? 90 : 270}
    return ''
  end


  #################################################### 

  def start_x(type)

    ln = @FontSize || 10
    c = @page_dims[0] / 2
    o = @margin
    x =  (type == 'D') ? (c - o - ln)  : (c + o + ln)
    return x
  end

  #################################################### */

  def calc_x(x)

    type = @page_types[@sect]
    data = @types[type]

    ln =  @FontSize * 1.25

    if (data['type'] == 'U')
      x += ln
      return x
    end

    x -= ln
    return x
  end

  #################################################### */

  def test_x(x)

    type = @page_types[@sect]
    data = @types[type]

    if (@stopx)
      if (data['type']=='U')
        if (x > @stopx)
          return 0
        end
      else 
        if (x < @stopx)
          return 0
        end
      end
    end
    #  FIX ME...use real fontsize for page numbers (assumes 10pt)

    if (data['type']=='U')
      ok = (x < @page_dims[0] - @margin - 1.1*10/72) ? 1 : 0
    else 
      ok = (x > @margin + 1.1*10/72) ? 1 : 0
    end

    return ok
  end

  #################################################### */

  def test_y(y)

    if (! @stopy)
      return 1
    end

    type = @page_types[@sect]
    data = @types[type]

    if (data['type']=='U')
      if (y < @stopy)
        return 0
      end
    else 
      if (y > @stopy)
        return 0
      end
    end

    return 1
  end

  #################################################### */

  def box(coords)
    idx = @pg - 1

    # if (! @buffer[idx].is_a?(Array))
    #   @box[idx][] = {}
    # end

    @box[idx] = coords
  end

  #Functions shamelessly pilfered from FDPF and/or RPDF */

  #################################################### */

  def TextWithDirection(x,y,txt,direction='D') 

    # txt.gsub!(/\)/,'\\)').gsub(/\(/,'\\(').gsub(/\\/,'\\\\')

    if (direction=='U')
      s=sprintf('BT %.2f %.2f %.2f %.2f %.2f %.2f Tm (%s) Tj ET',0,1,-1,0,x*@k,(@h-y)*@k,txt)
    else 
      s=sprintf('BT %.2f %.2f %.2f %.2f %.2f %.2f Tm (%s) Tj ET',0,-1,1,0,x*@k,(@h-y)*@k,txt)
    end

    return s
  end

  #################################################### */

  def Image(file,x,y,w=0,h=0,type='',link='')
    #Put an image on the page
    if(!isset(@images[file]))
      #First use of image, get info
      if(type=='')
        pos=strrpos(file,'.')
        if(!pos)
          # Error('Image file has no extension and no type was specified: '.file)
        end
        type=substr(file,pos+1)
      end
      type=strtolower(type)
      mqr=get_magic_quotes_runtime()
      set_magic_quotes_runtime(0)
      if(type=='jpg' || type=='jpeg')
        info=parsejpg(file)
      elsif(type=='png')
        info=parsepng(file)
      else
        #Allow for additional formats
        mtd='_parse'.type
        if(!method_exists(this,mtd))
          Error('Unsupported image type: '.type)
          info=mtd(file)
        end
        set_magic_quotes_runtime(mqr)
        info['i']=count(@images)+1
        @images[file]=info
      end
    else
      info=@images[file]
    end
    #Automatic width and height calculation if needed
    if(w==0 && h==0)
      #Put image at 72 dpi
      w=info['w']/@k
      h=info['h']/@k
    end
    if(w==0)
      w=h*info['w']/info['h']
    end
    if(h==0)
      h=w*info['h']/info['w']
    end
    if(link)
      Link(x,y,w,h,link)
    end
    return sprintf('q %.2f 0 0 %.2f %.2f %.2f cm /I%d Do Q',w*@k,h*@k,x*@k,(@h-(y+h))*@k,info['i'])
  end

  def simple_get(url)

    if (! function_exists("curl_init"))
      return file_get_contents(url)
    end

    ch  = curl_init()
    curl_setopt(ch, CURLOPT_URL, url)
    curl_setopt(ch, CURLOPT_RETURNTRANSFER, 1)
    res = curl_exec(ch)

    if (curl_errno(ch))
      error_log(curl_error(ch))
      return nil
    end

    return res
  end

end
