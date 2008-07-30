# 
#   Simple Ruby class to create 'pocketmod' style booklets from map sources.
#
#     Copyright (c) 2007 Andrew Turner.
# 
#    Based on Aaron Straup Cope's mmPDF
#     
#     http://www.aaronland.info/php/mmPDF/
#     Copyright (c) 2007 Aaron Straup Cope.
# 
#   This is free software, you may use it and distribute it under the
#   same terms as Perl itself.
# 
#   Id: mmPDF.php,v 1.26 2007/08/13 15:42:29 asc Exp 

require 'rubygems'
require 'hpricot'
require 'digest/md5'
require 'open-uri'
require 'tempfile'
require 'htmlentities'

class String
  HTML_DECODER = HTMLEntities.new
  def html_decode
    HTML_DECODER.decode(self)
  end
  def remove_html
    self.html_decode.gsub(/<\/?[^>]*>/, "")
  end
  def remove_cdata
    self.gsub(/<!\[CDATA\[/,'').gsub(/\]\]>/,'')    
  end
  def strip_tags
    self.gsub(/\<.*?>/, "");
  end
end

def limit_string(string, charlimit)
  return string[0,charlimit]
end

#require "PocketMod"
require File.dirname(__FILE__) + "/pocketmod"

class Pocketmap < Pocketmod 

  PAGE_COUNTS = {:simple => { 1 => 6, 2 => 14, 3 => 22, 4 => 30 }, 
                  :overview => { 1 => 3, 2 => 7, 3 => 11, 4 => 15 }}

  def initialize (args={}) 
    @places = []
    @sheets = 1
    @page_nb = (args['no_cover']) ? 1 : 2
    @appid = args['appid'] ||= "ourcloud"
    @qr = args['qr']
    @mm = args['modestmaps']
    @singlemap = !args['overview']
    @src = args['source']
    @index = {}
    super(args)
  end

  def add_map(url, max=0)
    case url
    when /platial\.com/
      return add_platial_map(url, max)
    when /google\.com/
      return add_google_map(url, max)
    when /del\.icio\.us/
      return add_delicious_map(url, max)
    when /delicious\.com/
      return add_delicious_map(url, max)
    when /mapufacture\.com/
      return add_mapufacture_map(url, max)
    end

    return add_kml_file(url, max)
  end

  # Data-fetching functions
  def add_mapufacture_map(url, max=0)
    # url = str_replace("kmlnl", "kml", url)
    # url = "#{url}?limit=#{max}" unless max == 0
    return add_kml_file(url, max, "mapufacture")
  end

  def add_platial_map(url, max=0)
    url = str_replace("kmlnl", "kml", url)
    return add_kml_file(url, max, "platial")
  end

  def add_google_map(url, max=0)
    # please for you to properly parse the URL...
    url = str_replace("output=nl", "output=kml", url)
    url = str_replace("&mpnum=3", "", url)
    return add_kml_file(url, max, 'google')
  end

  def add_kml_file(kml, max=0, provider="google")
    xml = Hpricot.XML(open(kml))

    if (! xml)
      return null
    end
    
    @title = (xml/:Document/:name).first.inner_text
    (xml/:Link).each do |network_link|
      add_kml_file((network_link/:href).inner_text, max)
    end

    (xml/:Placemark).each do |pl|
      name = place_name((pl/:name).inner_text, provider)
      desc = place_description((pl/:description).inner_text, provider)

      lon, lat = (pl/:Point/:coordinates).inner_text.split(",")

      add_place(name, desc, lat, lon)

      if ((max != 0) && (@places.length >= max))
        break
      end
    end

    return @places.length
  end

  # Data-massaging functions

  def place_name(name, provider="google")
    return name.remove_html.strip
  end

  def place_description(desc, provider="google")

    if (provider=='delicious')
      desc = html_entity_decode(desc)

      # rb = new Restobook()
      # 
      # if (rb->parse(desc))
      #   desc = rb->get("address", "raw")
      # 
      #   if (ph = rb->get("phone", "raw"))
      #     desc += " / {ph}"
      #   end
      # end
    elsif (provider=='platial')
      desc.gsub!(/<br>/, "\n")
      m = desc.match(/<div style='color:#666'>([^<]+)<\/div>/)
      desc = m[1]
    else 
      desc.gsub!(/<br>/, "\n")
    end

    if image = desc.match(/(http.+static\.flickr\.com.+?\.jpg)/)
      return image[1].gsub(/\.jpg/,"_s.jpg")
    else
      return limit_string((desc.remove_html.strip), 200)
    end
  end

  # Actual page generating functions */

  def add_place(name, desc, lat, lon, extra=[])

    key =  Digest::MD5.hexdigest(name + desc)

    if (@places.include?(key))
      return
    end

    return if lat.nil? || lon.nil?
    @places << key
    
    lat = lat.strip
    lon = lon.strip
    marker = {:lat => lat, :lon => lon, :radius => 18}

    if (! @singlemap)
      while (@page_nb.modulo(2) != 0)
        @page_nb += 1
      end

      map1 = get_img(lat, lon, "city", marker, false)
      res = add_map_image(map1, @page_nb, "large", "top")
    
      map_overview = get_img(lat, lon, "region", marker, false)
      res = add_map_image(map_overview, @page_nb, "small", "bottom")

      # if (extra['qr'])
      #   add_qr(extra['qr'])
      # end

      @page_nb = res['page'] + 1
      File.delete(map1)
    end

    # zoomed in map marker
    map2 = get_img(lat, lon, "street", marker)
    res = add_map_image(map2, @page_nb, "large", "top")

    # puts res.class
    @page_nb = res['page']

    txt = "<b>#{name}</b>\n"
    if(desc.match(/\.static\.flickr/))
      begin
        add_some_text(txt, @page_nb, {'y' => 200, 'resume' => false})
        add_some_image( getstore(desc), @page_nb, 'w' => 75, 'h' => 75, 'x' => 20, 'y' => 180)      
      rescue
        add_some_text(txt, @page_nb, {'y' => 200, 'resume' => false})
      end
    else
      # puts "page: #{@page_nb}"
      txt << desc
      add_some_text(txt, @page_nb, {'y' => 200, 'resume' => false})
    end
    #puts "pocketmap adding text page"

    # 

    # if (! @index.include?(name))
    #   @index[name] = []
    # end

    @index[name] = {:page => @page_nb, :lat => lat, :lon => lon}
    @page_nb = res['page'] + 1

    File.delete(map2)
    return 1
  end

  def add_map_image(map, page, size="large", position="top")
    #puts "pocketmap add_map_image"
    case size
    when /large/
      dims = {'w' => 190, 'h' => 190}
    when /small/
      dims = {'w' => 80, 'h' => 190}      
    end
    case position
    when /top/
      pos = {'x' => -5, 'y' => -15}
    when /bottom/
      pos = {'x' => -5, 'y' => (size =~ /large/ ? 70 : 180)}      
    end
    res = add_some_image(map, page, dims.merge(pos))
    #puts "pocketmap add_map_image done"
  end
  
  def add_titlepage( title )

    @page_nb = 1

    args = {'resume' => false}
    offset = 10
    res = {}
    title.split("\n").each do |line|
      offset += 10
      # puts "page: #{@page_nb}"
      res = add_some_text(line, @page_nb, args.merge('y' => offset))
    end
    @page_nb = res['page']

    args = {}

    return 1
  end

  def add_index(idx)
    #puts "pocketmap adding index"
    
    # 
    # how many pages (a) remain blank given the total number of sheets
    # what is the page number (b) of the last page
    # how many pages (c) will the index use
    # if c < b then set the start page to b - c
    # otherwise start from the current offset
    #

    # page_use = calculate_page_use_for_idx(idx)

    keys   = @buffer.keys.sort
    #puts "Index keys"
    #puts idx.keys
    
    page_use = (keys.length / 20.0).ceil

    # fix me - check for no cover...
    cnt = (idx.length) + page_use + ( @singlemap ? 0 : idx.length)
    @sheets = (cnt / 8.0).ceil
    last   = @sheets * 8
    # puts "Pure sheet count: #{@sheets} sheets - based on #{((cnt) / 8.0)} [keys: #{keys.length}, cnt: #{cnt}, page_use: #{page_use}], index on #{last} - # of idx #{idx.length}"

    if ((@page_nb + page_use) < last)
      @page_nb = last - (page_use - 1)
    end
    
    # puts "Index pages: #{page_use}, on page #{@page_nb}"
    
    args = {'resume' => false}
    
    # puts "page: #{@page_nb}"    
    add_some_text("<b>Index</b>", @page_nb)    
    offset = 15
    markers = []
    bounds = [180,90,-180,-90]
    
    names = idx.keys.sort
    names.each do |name|
      pgs = idx[name][:page]
      markers << {:lat => idx[name][:lat], :lon => idx[name][:lon], :radius => 18, :text => pgs.to_s}
      bounds = [
          [bounds[0], idx[name][:lon].to_f].min,
          [bounds[1], idx[name][:lat].to_f].min,
          [bounds[2], idx[name][:lon].to_f].max,
          [bounds[3], idx[name][:lat].to_f].max,                              
        ]
      
    # idx.each do |name, pgs|
      n = name.dup[0..25]
      n << " "
      
      # why would there be multiple pages for a single item?
      p = idx[name][:page]
      # pgs.each do |p|

        nlen = n.length
        plen = " {p}".length
        sect = @sect_width
        limit = sect - plen
        limit = 35
        str_len = (nlen + plen)

        while (limit > (str_len))
          n << "."
          nlen = n.length
          str_len = (nlen + plen)
        end

        #puts "Index: #{n} #{p}"
        res = add_some_text("#{n} #{p}", @page_nb, args.merge('y' => offset))
        @page_nb = res['page']

        offset += 10
        args = {}
      # end
    end
    
    unless markers.length == 0
      map_overview = get_img(markers.first[:lat], markers.first[:lon], [bounds[1], bounds[0], bounds[3], bounds[2]], markers, false)
      res = add_map_image(map_overview, @page_nb, "small", "bottom")
    end
    return 1
  end

  def Output(name='')
    add_titlepage("<b>PocketMap</b>\n#{@title}\n\n#{Time.now.strftime("%A, %B %e, %Y").gsub(/\s\s/,' ')}" )
    # add_some_image( "your_logo.png", 1, 'w' => 50, 'h' => 50, 'x' => 60, 'y' => 180)
    add_index(@index)
    
    super(name, @sheets)
    return
  end

  # QR functions */

  # def mk_qr(body, colour=array(0, 0, 0))
  # 
  #   qr_path = tempfile("qr" . md5(body))
  #   qr = new QR(@qr)
  # 
  #   args = array('d' => body, 'path' => qr_path, 'color' => colour)
  #   qr->encode(args)
  #   return qr_path
  # end
  # 
  # def add_qr(&qr_data)
  # 
  #   coords = array('y' => 2.5, 'h' => .75)
  # 
  #   qr_data.each do |data|
  #     barcode = mk_qr(data['body'], data['color'])
  #     add_some_image(barcode, @page_nb, coords)
  #     coords['x'] += .75
  #   end
  # end

  # Image fetching functions */

  def get_img(lat, lon, zoom_label, markers, balloons = true)

    zoom, height, width = mk_zoom(zoom_label)
    #puts "pocketmap get_img"
    markers = [markers] unless markers.is_a?(Array) # user may pass in a single marker
    
    if (@src == 'modestmaps')
      return get_img_modestmaps(lat, lon, zoom, height, width, markers, balloons)
    end

    return get_img_yahoo_imageapi(lat, lon, zoom, height, width, markers)
  end

  def get_img_modestmaps(lat, lon, zoom, height = 500, width = 500, markers = {}, balloon = true)

    fmt = "%s?provider=%s&height=%s&width=%s"    
    if zoom.is_a?(Array)
      zoom[2] += 0.01 if zoom[0] == zoom[2]
      zoom[3] += 0.01 if zoom[1] == zoom[3]
      
      fmt << "&method=extent&bbox=%s" % zoom.join(",")
    else
      fmt << "&method=center&latitude=%s&longitude=%s&zoom=%s" % [lat, lon, zoom]
    end
    
    url = fmt % [@mm['server'], @mm['provider'], height, width]
    markers.each_with_index do |marker, i|
      url << ("&marker=mark_%s,%s,%s,100,100,%s,%s" % [i, marker[:lat], marker[:lon], marker[:radius] || 18, balloon ? 1 : 0])
      url << ",%s" % marker[:text] unless marker[:text].nil? || marker[:text].length == 0
    end
    url << "&fill=#{@mm['marker']}" if fill && balloon
    # puts url
    return getstore(url, zoom)
  end

  def get_img_yahoo_imageapi(lat, lon, zoom, height = 500, width = 500, markers = {})

    req = "http://api.local.yahoo.com/MapsService/V1/mapImage?appid=#{@appid}&latitude=#{lat}&longitude=#{lon}&zoom=#{zoom}&image_width=#{width}&image_type=png"
    #puts req
    res = open(req).body
    #puts res
    # xml = new SimpleXMLElement(res)
    # 
    # if (! xml)
    #   return
    # end
    # 
    # return getstore(xml, zoom)
  end

  # Index functions - to be moved into 'pmPDF.php' (once they don't suck) */

  def calculate_page_use_for_idx(idx)

    txt = ''

    idx.each do |name, pgs|
      n = name.dup
      n << " "
      pgs.each do |p|
        nlen = n.length
        plen = " {p}".length

        sect = @sect_width
        limit = sect - plen
        str_len = (nlen + plen)
       
        while (limit > (str_len))
          n << "."
          nlen = n.length
          str_len = nlen + plen
        end

        txt << "#{n} #{p}\n"
      end
    end

    return calculate_page_use(txt)
  end

  def calculate_page_use(txt)

    start_page = @page_nb

    res = add_some_text(txt, start_page, {'calc_only' => true})

    @page_nb = start_page

    num = (res['page'] - start_page) + 1
    return num
  end

  # Utility functions */

  def getstore(url, suffix = '')
    tmp = "/tmp/" + Digest::MD5.hexdigest(url)

    # don't regenerate if we already have the map
    if File.exists?(tmp) # && open(tmp, "wb")
      puts "map image already exists, reuse & recycle!"
      return tmp 
    end
    
    open(tmp, "wb") do |file|
      file.write(open(url).read)
    end unless File.exists?(tmp)
    return tmp
  end

  # def decode_json(json)
  # 
  #   json_decode(json)
  # 
  #   if (is_array(json))
  #     return json
  #   end
  # 
  #   include('JSON.php')
  #   js = new Services_JSON()
  #   json = js->decode(json)
  # 
  #   if (json.is_a?(Array))
  #     return json
  #   end
  # 
  #   return null
  # end

  def mk_zoom(label='street')

    if (@src=~/modestmaps/)
      return mk_zoom_modestmaps(label)
    end

    return mk_zoom_yahoo(label)
  end

  def mk_zoom_yahoo(label='street')
    if (label=='city')
      return [4, 500, 500]
    end

    return [1, 500, 500]
  end

  def mk_zoom_modestmaps(label)

    if(label.is_a?(Array))
      return [label, 190, 380]
    elsif (label=='city')
      return [14, 380, 380]
    elsif (label=='region')
      return [11, 190, 380]
    end

    return [17, 380, 380]
  end
end

if __FILE__ == $0
  pages = 2

  modestmaps = {'server' => 'http://127.0.0.1:9999/',
    'provider' => 'MICROSOFT_ROAD',
    'marker' => 'YAHOO_AERIAL' }

  map_config = {:paper => 'letter',
    :folds => true,
    :margin => 10,
    'source' => 'modestmaps',
    'modestmaps' => modestmaps,
    'overview' => true }

  args = {
    :url => "http://mapsomething.com/demo/greenbuildings/CAGreenBuildings.kml",
    :number => Pocketmap::PAGE_COUNTS[(map_config['overview'] ? :overview : :simple )][pages],
    :filename => "pocketmap_#{pages}_#{map_config['overview']}.pdf" } 

  puts "Number of items #{args[:number]}"
  pm = Pocketmap.new map_config
  pm.add_map(args[:url], args[:number] || 0)
  pm.Output(args[:filename])

end
