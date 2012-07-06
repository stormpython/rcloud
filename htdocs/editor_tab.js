var editor = {
    widget: undefined,
    current_file_owner: undefined,
    current_filename: undefined,
    create_file_tree_widget: function() { 
        var that = this;
        var $tree = $("#editor-file-tree");
        $tree.tree({
            autoOpen: 1
        });
        $tree.bind(
            'tree.click', function(event) {
                if (event.node.id === "newfile") {
                    function validate_filename(n) {
                        if (/\.\./.test(n))
                            return false;
                        if (/[^0-9a-zA-Z_.]/.test(n))
                            return false;
                        return true;
                    }
                    var filename = prompt("please enter a filename", "[new filename]");
                    if (!validate_filename(filename)) {
                        alert("Invalid filename");
                        return;
                    }
                    that.new_file(filename);
                } else if (!_.isUndefined(event.node.file_type)) {
                    if (that.current_filename && 
                        (that.current_file_owner === rcloud.username())) {
                        that.save_file(rcloud.username(), that.current_filename, function() {
                            that.load_file(event.node.user_name, event.node.file_name);
                        });
                    } else {
                        that.load_file(event.node.user_name, event.node.file_name);
                    }
                }
            }
        );
        
    },
    populate_file_list: function() {
        var that = this;
        rcloud.get_all_user_filenames(function(data) {
            data = data.value;
            var this_user = rcloud.username();
            var result = [];
            for (var i=0; i<data.length; ++i) {
                var dirname = data[i].value[0].value[0];
                var filenames = data[i].value[1].value;
                
                var file_nodes = _.map(filenames, function(name) {
                    return { 
                        label: name,
                        file_name: name,
                        user_name: dirname,
                        file_type: (this_user === dirname) ? "w" : "r",
                        id: '/' + dirname + '/' + name 
                    };
                });
                if (dirname === this_user) {
                    file_nodes.push({
                        label: "[New File]",
                        id: "newfile"
                    });
                };
                var node = { 
                    label: dirname,
                    id: '/' + dirname,
                    children: file_nodes 
                };
                result.push(node);
            }
            var tree_data = [ { 
                label: '/',
                children: result 
            } ];
            var $tree = $("#editor-file-tree");
            $tree.tree("loadData", tree_data);
            var folder = $tree.tree('getNodeById', "/" + rcloud.username());
            $(folder.element).parent().prepend(folder.element);
            $tree.tree('openNode', folder);
        });
    },
    init: function() {
        d3.select("#input-text-source-results-title").style("display", "none");
        d3.select("#input-text-history-results-title").style("display", "none");
        var widget = ace.edit("editor");
        widget.setTheme("ace/theme/chrome");
        widget.commands.addCommand({
            name: 'sendToR',
            bindKey: {
                win: 'Ctrl-Return',
                mac: 'Command-Return',
                sender: 'editor'
            },
            exec: function(widget, args, request) {
                var range = widget.getSelectionRange();
                if (range.start.column === range.end.column &&
                    range.start.row    === range.end.row) {
                    // FIXME check EOF here.
                    range = {start: {column: 0, row: range.start.row},
                             end: {column: 0, row: range.start.row+1}};
                    var cursor = widget.getSession().getSelection().getCursor();
                    widget.gotoLine(cursor.row+2);
                };
                if (text === "")
                    return;
                var text = widget.getSession().doc.getTextRange(range);
                rclient.send_as_notebook_cell(text);
            }
        });
        this.widget = widget;
        var that = this;
        var RMode = require("mode/r").Mode;
        var session = this.widget.getSession();
        var doc = session.doc;
        this.widget.getSession().setMode(new RMode(false, doc, session));
        this.create_file_tree_widget();
        this.populate_file_list();
        $("#editor-title-header").text(rcloud.username() + " | [untitled]");
        var old_text = "";
        window.setInterval(function() {
            var new_text = $("#input-text-search").val();
            if (new_text !== old_text) {
                old_text = new_text;
                that.search(new_text);
            }
        }, 500);
    },
    save_file: function(user, filename, k) {
        rcloud.save_to_user_file(user, filename, this.widget.getSession().getValue(), k);
    },
    load_file: function(user, filename) {
        var that = this;
        rcloud.load_user_file(user, filename, function(file_lines) {
            file_lines = file_lines.value;
            that.widget.getSession().setValue(file_lines.join("\n"));
            that.current_file_owner = user;
            that.current_filename = filename;
            var ro = user !== rcloud.username();
            that.widget.setReadOnly(false);
            if (!ro) {
                that.widget.focus();
                $("#editor-title-header").html(user + " | " + "<a href=\"share.html?user="+user+"&filename="+filename+"\">" + filename + "</a>");
            } else {
                $("#editor-title-header").text(user + " | " + filename + " | Read Only");
            }
        });
    },
    search: function(search_string) {
        var that = this;
        function split_source_search_lines(line) {
            var r = /:/g;
            var r2 = /\/([^/]+)\/([^/]+)/;
            var result = [];
            while (r.exec(line) !== null) {
                result.push(r.lastIndex);
                if (result.length === 2) {
                    var path = line.substring(0, result[0]-1);
                    var t = path.match(r2);
                    return [t[1], t[2],
                            line.substring(result[0], result[1]-1),
                            line.substring(result[1])];
                }
            }
            throw "shouldn't get here";
        };
        function split_history_search_lines(line) {
            var t = line.indexOf(':');
            var r = /\|/g;
            var line_number = line.substring(0, t);
            line = line.substring(t+1);
            var result = [];
            while (r.exec(line) !== null) {
                result.push(r.lastIndex);
                if (result.length === 2) {
                    return [line_number, 
                            line.substring(0, result[0]-1),
                            line.substring(result[0], result[1]-1),
                            line.substring(result[1])];
                }
            }
            throw "shouldn't get here";
        };

        function update_source_search(result) {
            d3.select("#input-text-source-results-title")
                .style("display", (result.value !== null && result.value.length >= 1)?null:"none");
            var data = _.map(result.value, split_source_search_lines);
            d3.select("#input-text-source-results-table")
                .selectAll("tr").remove();
            var td_classes = ["user", "filename", "linenumber", "loc"];
            d3.select("#input-text-source-results-table")
                .selectAll("tr")
                .data(data)
                .enter().append("tr")
                        .selectAll("td")
                        .data(function(d,i) { 
                            return _.map(d, function(v, k) {
                                return [v, i];
                            });
                        })
                        .enter()
                        .append("td")
                        .text(function(d, i) { 
                            if (i === 2) { 
                                return d[0] + ":"; 
                            } else {
                                return d[0];
                            }
                        })
                        .attr("class", function(d, i) {
                            var j = d[1];
                            d = d[0];
                            if (j === 0 || data[j-1][i] !== d)
                                return "text-result-table-" + td_classes[i];
                            else
                                return "text-result-table-same-" + td_classes[i];
                        })
                        .on("click", function(d, i) {
                            if (i !== 1 && i !== 3)
                                return;
                            var j = d[1];
                            var user = data[j][0], filename = data[j][1];
                            that.load_file(user, filename);
                        })
                ;
        };
        function update_history_search(result) {
            d3.select("#input-text-history-results-title")
                .style("display", (result.value !== null && result.value.length >= 1)?null:"none");
            var data = _.map(result.value, split_history_search_lines);
            d3.select("#input-text-history-results-table")
                .selectAll("tr").remove();
            var td_classes = ["date", "user", "loc"];
            d3.select("#input-text-history-results-table")
                .selectAll("tr")
                .data(data)
                .enter().append("tr")
                        .selectAll("td")
                        .data(function(d,i) { 
                            return _.map(d.slice(1), function(v, k) {
                                return [v, i];
                            });
                        })
                        .enter()
                        .append("td")
                        .text(function(d) { 
                            return d[0];
                        })
                        .attr("class", function(d, i) {
                            var j = d[1];
                            d = d[0];
                            if (j === 0 || data[j-1][i+1] !== d)
                                return "text-result-table-" + td_classes[i];
                            else
                                return "text-result-table-same-" + td_classes[i];
                        })
                        .on("click", function(d, i) {
                        })
                ;
        };
        rcloud.search(search_string, function(result) {
            update_source_search(result.value[0]);
            update_history_search(result.value[1]);
        });
    },
    new_file: function(filename) {
        var that = this;
        rcloud.create_user_file(filename, function(result) {
            that.current_filename = filename;
            that.current_file_owner = rcloud.username();
            that.clear();
            that.populate_file_list();
            that.widget.setReadOnly(false);
            that.widget.focus();
        });
    },
    clear: function() {
        this.widget.getSession().setValue("");
    }
};
